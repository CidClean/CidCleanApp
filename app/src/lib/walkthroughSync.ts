import { loadWalkthrough, saveWalkthrough } from './walkthroughStore';
import { serverData, type WalkthroughDoc } from './walkthroughRules';

/**
 * Cola de sincronización del walkthrough (current/arquitectura.md: "se guarda en el teléfono y sincroniza con una
 * cola de fotos"). Primero el documento (save_walkthrough), después cada foto pendiente al bucket privado.
 * Sin red no se pierde nada: queda pendiente y se reintenta.
 */

export type SendResult = 'ok' | 'offline' | 'error';

export type SyncDeps = {
  saveDraft: (doc: WalkthroughDoc, data: unknown) => Promise<SendResult>;
  uploadPhoto: (path: string, uri: string) => Promise<SendResult>;
};

export type SyncOutcome = 'synced' | 'offline' | 'error' | 'missing';

let running: Promise<SyncOutcome> | null = null;

/** Una pasada de la cola. Si ya hay una corriendo, espera esa. */
export function syncWalkthrough(id: string, deps: SyncDeps): Promise<SyncOutcome> {
  if (running) return running;
  running = (async () => {
    try {
      return await syncOnce(id, deps);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce(id: string, deps: SyncDeps): Promise<SyncOutcome> {
  const loaded = await loadWalkthrough(id);
  if (!loaded) return 'missing';
  let doc: WalkthroughDoc = loaded;

  if (doc.rev > doc.syncedRev) {
    const sentRev = doc.rev;
    const result = await deps.saveDraft(doc, serverData(doc.data));
    if (result !== 'ok') return result;
    // Lo que se cambió mientras se mandaba sigue pendiente (rev > sentRev).
    doc = (await loadWalkthrough(id)) ?? doc;
    doc = { ...doc, syncedRev: Math.max(doc.syncedRev, sentRev) };
    await saveWalkthrough(doc);
  }

  for (const area of doc.data.areas) {
    for (const photo of area.photos) {
      if (photo.uploaded || !photo.uri) continue;
      const result = await deps.uploadPhoto(photo.path, photo.uri);
      if (result !== 'ok') return result;
      const latest: WalkthroughDoc = (await loadWalkthrough(id)) ?? doc;
      doc = {
        ...latest,
        data: {
          ...latest.data,
          areas: latest.data.areas.map((a) => ({
            ...a,
            photos: a.photos.map((p) => (p.id === photo.id ? { ...p, uploaded: true } : p)),
          })),
        },
      };
      await saveWalkthrough(doc);
    }
  }

  const final: WalkthroughDoc = (await loadWalkthrough(id)) ?? doc;
  const clean = final.rev <= final.syncedRev && final.data.areas.every((a) => a.photos.every((p) => p.uploaded));
  if (clean && !final.everSynced) await saveWalkthrough({ ...final, everSynced: true });
  return clean ? 'synced' : 'offline';
}
