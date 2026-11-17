import type { ApiResult } from './employeesApi';
import { failureFromCode } from './employeesApi';
import { supabase } from './supabase';
export { canSeeDocuments } from './visibility';

/**
 * Menú → Documentos (orden 115, D-317 4, D-320): biblioteca central. documents_library (migración 20261117000004)
 * devuelve solo lo que quien llama ya puede ver; abrir y descargar usan el visor y las funciones de cada documento.
 */
export const LIBRARY_FILTERS = ['all', 'quotes', 'sow', 'contracts', 'walkthroughs', 'personal', 'reports'] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];

export type LibraryDoc = {
  kind: 'quote' | 'sow' | 'contract' | 'jobsite' | 'walkthrough' | 'personal';
  id: string;
  title: string;
  owner: string;
  date: string | null;
  source: 'quote-file' | 'jobsite' | 'walkthrough' | 'document' | 'ica-signed';
  openId: string | null;
  path: string | null;
  version: number | null;
  superAdminOnly: boolean;
};

export const PAGE_SIZE = 50;

/** Título visible de una fila: el del servidor, con las etiquetas en el idioma de la app. */
export function rowTitle(
  d: Pick<LibraryDoc, 'kind' | 'title'>,
  t: { contract: (v: string) => string; jobsiteDoc: (x: string) => string; insurance: string },
): string {
  if (d.kind === 'contract') return t.contract(d.title.replace(/^contract\s*/i, ''));
  if (d.kind === 'jobsite') return t.jobsiteDoc(d.title);
  if (d.kind === 'personal' && d.title === 'Insurance certificate') return t.insurance;
  return d.title;
}

export function toLibraryDoc(r: Record<string, unknown>): LibraryDoc {
  const s = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    kind: (s(r.doc_kind) ?? 'jobsite') as LibraryDoc['kind'],
    id: s(r.doc_id) ?? '',
    title: s(r.title) ?? '',
    owner: s(r.owner) ?? '',
    date: s(r.doc_date),
    source: (s(r.open_source) ?? 'jobsite') as LibraryDoc['source'],
    openId: s(r.open_id),
    path: s(r.open_path),
    version: typeof r.open_version === 'number' ? r.open_version : null,
    superAdminOnly: r.super_admin_only === true,
  };
}

/** Parámetros del visor para abrir (o descargar, con download = '1') un documento de la biblioteca. */
export function viewerParams(d: LibraryDoc, title: string, language: 'es' | 'en'): Record<string, string> {
  const base: Record<string, string> = { source: d.source, title, download: '1' };
  if (d.source === 'quote-file') return { ...base, path: d.path ?? '' };
  if (d.source === 'walkthrough') return { ...base, documentId: d.openId ?? '', version: String(d.version ?? 1), language };
  return { ...base, documentId: d.openId ?? '' };
}

export async function fetchLibrary(filter: LibraryFilter, search: string, offset = 0): Promise<ApiResult<LibraryDoc[]>> {
  try {
    const { data, error } = await supabase.rpc('documents_library', {
      p_filter: filter,
      p_search: search.trim() === '' ? null : search.trim().slice(0, 100),
      p_offset: offset,
    });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: ((data ?? []) as Record<string, unknown>[]).map(toLibraryDoc) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
