import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { extensionFor, type DocumentKind, type EmployeeDocument } from './employeeRules';
import { failureFromCode, functionFailure, type ApiResult } from './employeesApi';
import { supabase } from './supabase';

/** Documentos de los 1099 (D-125, D-175, D-183, D-193): bucket privado employee-docs. Solo con `empleados_gestionar_documentos`. */

const BUCKET = 'employee-docs';

export type PickedFile = { uri: string; mimeType: string | null; name: string | null };

export async function fetchDocuments(profileId: string): Promise<ApiResult<EmployeeDocument[]>> {
  try {
    const { data, error } = await supabase
      .from('profile_documents')
      .select('id, kind, uploaded_at')
      .eq('profile_id', profileId)
      .is('replaced_at', null);
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return {
      ok: true,
      data: (data as { id: string; kind: DocumentKind; uploaded_at: string }[]).map((d) => ({
        id: d.id,
        kind: d.kind,
        uploadedAt: d.uploaded_at,
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

function uniqueName(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Ruta en el bucket: `<empleado>/<tipo>/<nombre único>.<ext>`; la base la valida al registrarla. */
export function documentPath(profileId: string, kind: DocumentKind, file: PickedFile, name: string = uniqueName()): string {
  return `${profileId}/${kind}/${name}.${extensionFor(file.mimeType, file.name)}`;
}

/** Sube el archivo al bucket y lo registra como el documento vigente (el anterior queda reemplazado). */
export async function uploadDocument(profileId: string, kind: DocumentKind, file: PickedFile): Promise<ApiResult<null>> {
  try {
    const path = documentPath(profileId, kind, file);
    const bytes = await (await fetch(file.uri)).arrayBuffer();
    const upload = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.mimeType ?? 'application/octet-stream',
    });
    if (upload.error) return { ok: false, reason: 'server' };
    const { error } = await supabase.rpc('register_profile_document', { p_profile: profileId, p_kind: kind, p_path: path });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Pide la URL firmada de un documento (D-125, D-196). El bucket no tiene política de lectura: el único camino es la
 * Edge Function open-document, que exige empleados_gestionar_documentos, registra quién y cuándo en el historial y
 * firma una URL de 60 s. El visor de la app la descarga a la caché privada y la lee ahí.
 */
export async function fetchDocumentUrl(documentId: string): Promise<ApiResult<{ url: string }>> {
  try {
    const { data, error } = await supabase.functions.invoke('open-document', { body: { document_id: documentId } });
    if (error) return { ok: false, reason: await functionFailure(error) };
    const url: unknown = data?.url;
    if (typeof url !== 'string') return { ok: false, reason: 'server' };
    return { ok: true, data: { url } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export type PickResult = { kind: 'picked'; file: PickedFile } | { kind: 'cancelled' } | { kind: 'denied' };

/** Tomar una foto con la cámara (D-183). */
export async function takePhoto(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { kind: 'denied' };
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || !result.assets[0]) return { kind: 'cancelled' };
  const asset = result.assets[0];
  return { kind: 'picked', file: { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', name: asset.fileName ?? null } };
}

/** Escoger un archivo del teléfono: foto o PDF (D-183). */
export async function chooseFile(): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return { kind: 'cancelled' };
  const asset = result.assets[0];
  return { kind: 'picked', file: { uri: asset.uri, mimeType: asset.mimeType ?? null, name: asset.name } };
}
