import * as DocumentPicker from 'expo-document-picker';

import { failureFromCode, type ApiResult } from './employeesApi';
import { supabase } from './supabase';

/**
 * Términos del staff en PDF (D-176, D-187). Bucket privado `terms`: lo lee cualquier usuario autenticado y solo el
 * Super Admin sube. La versión vigente la da get_current_terms; publicar es publish_terms (solo Super Admin).
 */

const BUCKET = 'terms';
const KIND = 'staff';
/** staff (D-176), portal del cliente (D-209: mismo mecanismo, PDF en Ajustes) o Política de Privacidad (D-282). */
export type TermsKind = 'staff' | 'portal' | 'privacy';
const SIGNED_URL_SECONDS = 60; // URL firmada de corta duración

/** major: cambio importante (la privacidad lo decide el Super Admin, D-282; staff y portal siempre lo son). */
export type CurrentTerms = { version: number; publishedAt: string; filePath: string; major: boolean };

/** Versión vigente de los términos del staff; null si todavía no se publicó ninguna. */
export async function fetchCurrentTerms(kind: TermsKind = KIND): Promise<ApiResult<CurrentTerms | null>> {
  try {
    const { data, error } = await supabase.rpc('get_current_terms', { p_kind: kind });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    const row = (data as { version: number; published_at: string; file_path: string; major?: boolean }[] | null)?.[0];
    return {
      ok: true,
      data: row ? { version: row.version, publishedAt: row.published_at, filePath: row.file_path, major: row.major !== false } : null,
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * "Leer los términos completos" (D-176, D-196): firma una URL de 60 s del PDF vigente en el bucket terms.
 * El visor de la app la descarga a la caché privada y la lee ahí.
 */
export async function fetchTermsUrl(kind: TermsKind = KIND): Promise<ApiResult<{ url: string }>> {
  try {
    const current = await fetchCurrentTerms(kind);
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
export function termsPath(name: string = uniqueName(), kind: TermsKind = KIND): string {
  return `${kind}/${name}.pdf`;
}

/**
 * Sube el PDF al bucket y publica la versión siguiente (publish_terms valida que el archivo exista).
 * `major` solo cuenta para la privacidad (D-282): si es importante, el staff tiene que aceptarla; si no, solo se avisa.
 */
export async function publishTerms(file: PickedPdf, kind: TermsKind = KIND, major: boolean = true): Promise<ApiResult<null>> {
  try {
    const path = termsPath(undefined, kind);
    const bytes = await (await fetch(file.uri)).arrayBuffer();
    const upload = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf' });
    if (upload.error) return { ok: false, reason: 'server' };
    const { error } = await supabase.rpc('publish_terms', { kind, file_path: path, major });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
