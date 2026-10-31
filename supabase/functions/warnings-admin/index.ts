// Advertencias escritas (orden 66, D-285, ICA §10): verify_jwt activado. Con el JWT de quien llama, las funciones de
// la base deciden: solo el Super Admin crea o anula; ven la lista y abren el documento el Super Admin y quien edita y
// desactiva empleados. La service role solo sube y firma los documentos del bucket privado contractor-docs.
// Acciones:
//   list   { profile_id }                                               advertencias y cuántas están vigentes
//   create { profile_id, issued_on, reason, file?, mime_type? }         documento opcional (PDF o imagen, base64)
//   void   { warning_id, reason }                                       anular, con motivo
//   open   { warning_id }                                               URL de 60 s del documento (queda en el historial)
// Este archivo no contiene llaves.
import { CORS, clienteDeQuienLlama, clienteDeServicio, errorDeBase, responder } from '../_shared/comun.ts';
import { tokenAleatorio } from '../_shared/quotes.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const BUCKET = 'contractor-docs';
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp' };
const MAXIMO = 10 * 1024 * 1024;

function fallo(e: { code?: string }) {
  const x = errorDeBase(e.code);
  return responder(x.status, { error: x.error });
}

function deBase64(texto: string): Uint8Array {
  const bin = atob(texto);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { error: 'method_not_allowed' });
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return responder(400, { error: 'invalid' });
  }
  const quien = clienteDeQuienLlama(req);
  const servicio = clienteDeServicio();
  const id = (k: string) => (typeof b[k] === 'string' && UUID.test(b[k] as string) ? (b[k] as string) : null);

  switch (b.action) {
    case 'list': {
      if (!id('profile_id')) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('written_warnings_for', { p_profile: id('profile_id') });
      return error ? fallo(error) : responder(200, data);
    }
    case 'create': {
      const perfil = id('profile_id');
      const fecha = typeof b.issued_on === 'string' && FECHA.test(b.issued_on) ? b.issued_on : null;
      const motivo = typeof b.reason === 'string' ? b.reason.trim().slice(0, 2000) : '';
      if (!perfil || !fecha || !motivo) return responder(400, { error: 'invalid' });
      let path: string | null = null;
      let mime: string | null = null;
      if (typeof b.file === 'string' && b.file) {
        mime = String(b.mime_type ?? 'application/pdf');
        let datos: Uint8Array;
        try {
          datos = deBase64(b.file);
        } catch {
          return responder(400, { error: 'invalid' });
        }
        if (!EXT[mime] || datos.length === 0 || datos.length > MAXIMO) return responder(400, { error: 'invalid' });
        // Se comprueba antes de subir que quien llama es el Super Admin.
        const { data: soy, error: e0 } = await quien.rpc('is_super_admin');
        if (e0) return fallo(e0);
        if (soy !== true) return responder(403, { error: 'forbidden' });
        path = `${perfil}/warnings/${tokenAleatorio(12)}.${EXT[mime]}`;
        const up = await servicio.storage.from(BUCKET).upload(path, datos, { contentType: mime, upsert: false });
        if (up.error) return responder(500, { error: 'server_error' });
      }
      const { data, error } = await quien.rpc('create_written_warning', {
        p_profile: perfil, p_issued_on: fecha, p_reason: motivo, p_path: path, p_mime: mime,
      });
      if (error) {
        if (path) await servicio.storage.from(BUCKET).remove([path]);
        return fallo(error);
      }
      return responder(200, data);
    }
    case 'void': {
      const motivo = typeof b.reason === 'string' ? b.reason.trim().slice(0, 500) : '';
      if (!id('warning_id') || !motivo) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('void_written_warning', { p_warning: id('warning_id'), p_reason: motivo });
      return error ? fallo(error) : responder(200, data);
    }
    case 'open': {
      if (!id('warning_id')) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('open_warning_document', { p_warning: id('warning_id') });
      if (error) return fallo(error);
      const { data: s, error: e2 } = await servicio.storage.from(BUCKET).createSignedUrl(data as string, 60);
      return e2 || !s ? responder(500, { error: 'server_error' }) : responder(200, { url: s.signedUrl, expires_in: 60 });
    }
    default:
      return responder(400, { error: 'invalid' });
  }
});
