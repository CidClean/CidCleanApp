import * as DocumentPicker from 'expo-document-picker';

import { failureFromCode, type ApiResult } from './employeesApi';
import { supabase } from './supabase';

/**
 * Términos del staff en PDF (D-176, D-187). Bucket privado `terms`: lo lee cualquier usuario autenticado y solo el
 * Super Admin sube. La versión vigente la da get_current_terms; publicar es publish_terms (solo Super Admin).
 */

const BUCKET = 'terms';
const KIND = 'staff';
const SIGNED_URL_SECONDS = 60; // URL firmada de corta duración

export type CurrentTerms = { version: number; publishedAt: string; filePath: string };

/** Versión vigente de los términos del staff; null si todavía no se publicó ninguna. */
export async function fetchCurrentTerms(): Promise<ApiResult<CurrentTerms | null>> {
  try {
    const { data, error } = await supabase.rpc('get_current_terms', { p_kind: KIND });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    const row = (data as { version: number; published_at: string; file_path: string }[] | null)?.[0];
    return { ok: true, data: row ? { version: row.version, publishedAt: row.published_at, filePath: row.file_path } : null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * "Leer los términos completos" (D-176, D-196): firma una URL de 60 s del PDF vigente en el bucket terms.
 * El visor de la app la descarga a la caché privada y la lee ahí.
 */
export async function fetchTermsUrl(): Promise<ApiResult<{ url: string }>> {
  try {
    const current = await fetchCurrentTerms();
    if (!current.ok) return current;
    if (current.data === null) return { ok: false, reason: 'not_found' };
    const signed = await supabase.storage.from(BUCKET).createSignedUrl(current.data.filePath, SIGNED_URL_SECONDS);
    if (signed.error || !signed.data) return { ok: false, reason: 'server' };
    return { ok: true, data: { url: signed.data.signedUrl } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export type PickedPdf = { uri: string; name: string };
export type PickPdfResult = { kind: 'picked'; file: PickedPdf } | { kind: 'cancelled' };

/** Escoge un PDF del teléfono (expo-document-picker). */
export async function choosePdf(): Promise<PickPdfResult> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return { kind: 'cancelled' };
  const asset = result.assets[0];
  return { kind: 'picked', file: { uri: asset.uri, name: asset.name } };
}

function uniqueName(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Ruta en el bucket: `staff/<nombre único>.pdf`. */
export function termsPath(name: string = uniqueName()): string {
  return `${KIND}/${name}.pdf`;
}

/** Sube el PDF al bucket y publica la versión siguiente (publish_terms valida que el archivo exista). */
export async function publishTerms(file: PickedPdf): Promise<ApiResult<null>> {
  try {
    const path = termsPath();
    const bytes = await (await fetch(file.uri)).arrayBuffer();
    const upload = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf' });
    if (upload.error) return { ok: false, reason: 'server' };
    const { error } = await supabase.rpc('publish_terms', { kind: KIND, file_path: path });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
