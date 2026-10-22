import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { supabase } from './supabase';
import type { SendResult, SyncDeps } from './walkthroughSync';
import type { WalkthroughDoc } from './walkthroughRules';

/** Servidor del walkthrough (migración 20261023000001) y archivos de las fotos en el teléfono. */

const BUCKET = 'walkthrough-photos';

/** Error de red (sin señal) contra error del servidor. */
function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /network|fetch|timeout|offline|Failed to fetch/i.test(msg);
}

export const supabaseSyncDeps: SyncDeps = {
  async saveDraft(doc: WalkthroughDoc, data: unknown): Promise<SendResult> {
    try {
      const { error } = await supabase.rpc('save_walkthrough', {
        p_id: doc.id,
        p_site: doc.siteId,
        p_appointment: doc.appointmentId,
        p_data: data,
      });
      if (!error) return 'ok';
      return isNetworkError(error) ? 'offline' : 'error';
    } catch (e) {
      return isNetworkError(e) ? 'offline' : 'error';
    }
  },
  async uploadPhoto(path: string, uri: string): Promise<SendResult> {
    try {
      const bytes = await (await fetch(uri)).arrayBuffer();
      const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: path.endsWith('.png') ? 'image/png' : path.endsWith('.heic') ? 'image/heic' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
        upsert: false,
      });
      // Ya estaba subida (un reintento después de un corte): cuenta como subida.
      if (!error || /exists|duplicate/i.test(error.message)) return 'ok';
      return isNetworkError(error) ? 'offline' : 'error';
    } catch (e) {
      return isNetworkError(e) ? 'offline' : 'error';
    }
  },
};

export type ServerWalkthrough = { id: string; status: 'draft' | 'closed'; draft: unknown; currentVersion: number };

/** El walkthrough de un sitio en el servidor, si existe (para retomarlo en otro teléfono). */
export async function fetchServerWalkthrough(siteId: string): Promise<{ ok: true; data: ServerWalkthrough | null } | { ok: false }> {
  try {
    const { data, error } = await supabase
      .from('walkthroughs')
      .select('id, status, draft, current_version')
      .eq('site_id', siteId)
      .maybeSingle();
    if (error) return { ok: false };
    if (!data) return { ok: true, data: null };
    const r = data as { id: string; status: 'draft' | 'closed'; draft: unknown; current_version: number };
    return { ok: true, data: { id: r.id, status: r.status, draft: r.draft, currentVersion: r.current_version } };
  } catch {
    return { ok: false };
  }
}

/**
 * Cierra el walkthrough (o guarda una corrección como versión nueva). Pide que el documento y las fotos ya estén
 * sincronizados. TEMPORAL: aún no hay botón que lo llame; va en el paso Resumen, que falta decidir.
 */
export async function closeWalkthrough(id: string): Promise<{ ok: true; version: number } | { ok: false; reason: 'photos' | 'forbidden' | 'network' | 'server' }> {
  try {
    const { data, error } = await supabase.rpc('close_walkthrough', { p_id: id });
    if (error) {
      if (error.code === '22023') return { ok: false, reason: 'photos' };
      if (error.code === '42501') return { ok: false, reason: 'forbidden' };
      return { ok: false, reason: 'server' };
    }
    return { ok: true, version: data as number };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Copia la foto de la cámara a la carpeta privada de la app, para que siga ahí sin conexión y tras reiniciar.
 * En la web (solo para pruebas) se usa la misma dirección.
 */
export function keepPhotoOnDevice(sourceUri: string, walkthroughId: string, fileName: string): string {
  if (Platform.OS === 'web') return sourceUri;
  const directory = new Directory(Paths.document, 'walkthroughs', walkthroughId);
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, fileName);
  new File(sourceUri).copy(destination);
  return destination.uri;
}
