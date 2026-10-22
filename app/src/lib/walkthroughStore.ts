import AsyncStorage from '@react-native-async-storage/async-storage';

import type { WalkthroughDoc } from './walkthroughRules';

/**
 * Walkthroughs guardados en el teléfono (D-004: funciona completo sin internet). Cada documento va en su propia
 * clave de AsyncStorage y las fotos como archivos (walkthroughFiles.ts). Los cambios avisan a las pantallas abiertas.
 */

const PREFIX = 'cidclean-wt:';

type KV = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem' | 'getAllKeys'>;
let kv: KV = AsyncStorage;

/** Para las pruebas. */
export function setWalkthroughStorage(next: KV): void {
  kv = next;
  memory.clear();
}

const memory = new Map<string, WalkthroughDoc>();
const listeners = new Set<(doc: WalkthroughDoc) => void>();

export function onWalkthroughChange(fn: (doc: WalkthroughDoc) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function loadWalkthrough(id: string): Promise<WalkthroughDoc | null> {
  const cached = memory.get(id);
  if (cached) return cached;
  const raw = await kv.getItem(PREFIX + id);
  if (!raw) return null;
  try {
    const doc = JSON.parse(raw) as WalkthroughDoc;
    memory.set(id, doc);
    return doc;
  } catch {
    return null;
  }
}

export async function saveWalkthrough(doc: WalkthroughDoc): Promise<void> {
  memory.set(doc.id, doc);
  await kv.setItem(PREFIX + doc.id, JSON.stringify(doc));
  listeners.forEach((fn) => fn(doc));
}

export async function listWalkthroughs(): Promise<WalkthroughDoc[]> {
  const keys = (await kv.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  const docs = await Promise.all(keys.map((k) => loadWalkthrough(k.slice(PREFIX.length))));
  return docs.filter((d): d is WalkthroughDoc => d !== null);
}

/** El walkthrough de un sitio que ya está en este teléfono (uno por sitio, D-003). */
export async function findWalkthroughForSite(siteId: string): Promise<WalkthroughDoc | null> {
  return (await listWalkthroughs()).find((d) => d.siteId === siteId) ?? null;
}

/**
 * Aplica un cambio de la persona: sube rev (queda pendiente de mandar) y guarda.
 * Lee siempre la última versión guardada para no pisar lo que haya hecho la sincronización.
 */
export async function updateWalkthrough(
  id: string,
  change: (doc: WalkthroughDoc) => WalkthroughDoc,
  now: Date = new Date(),
): Promise<WalkthroughDoc | null> {
  const current = await loadWalkthrough(id);
  if (!current) return null;
  const next = { ...change(current), rev: current.rev + 1, updatedAt: now.toISOString() };
  await saveWalkthrough(next);
  return next;
}
