// Subida manual de un W-9 por un admin (D-280). verify_jwt activado.
// 1) Con el JWT de quien llama, has_permission('empleados_gestionar_documentos') (D-193): sin permiso, 403 y no se sube nada.
// 2) La service role cifra el archivo (AES-256-GCM, W9_FILE_KEY) y lo sube a employee-docs/<perfil>/w9/<aleatorio>.<ext>.enc
//    (la app ya no puede subir a la carpeta w9 de Storage).
// 3) register_profile_document, otra vez con el JWT de quien llama, valida el perfil y la ruta, lo deja como W-9
//    vigente y lo registra en el historial. Si falla, el archivo subido se borra.
// Cuerpo: { profile_id, file (base64), mime_type }. Devuelve { document_id }.
import { cifrar, claveW9 } from '../_shared/cifrado.ts';
import { CORS, clienteDeQuienLlama, clienteDeServicio, errorDeBase, responder } from '../_shared/comun.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp',
};
const MAXIMO = 10 * 1024 * 1024;

function deBase64(texto: string): Uint8Array {
  const bin = atob(texto);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { error: 'method_not_allowed' });

  let perfil = '';
  let mime = '';
  let datos: Uint8Array;
  try {
    const body = await req.json();
    perfil = String(body.profile_id ?? '');
    mime = String(body.mime_type ?? 'application/pdf');
    datos = deBase64(String(body.file ?? ''));
  } catch {
    return responder(400, { error: 'invalid' });
  }
  if (!UUID.test(perfil) || !EXT[mime] || datos.length === 0 || datos.length > MAXIMO) return responder(400, { error: 'invalid' });

  const quien = clienteDeQuienLlama(req);
  const { data: puede, error: errorPermiso } = await quien.rpc('has_permission', { perm: 'empleados_gestionar_documentos' });
  if (errorPermiso) {
    const { status, error: codigo } = errorDeBase((errorPermiso as { code?: string }).code);
    return responder(status, { error: codigo });
  }
  if (puede !== true) return responder(403, { error: 'forbidden' });

  const servicio = clienteDeServicio();
  const aleatorio = crypto.randomUUID().replace(/-/g, '');
  const ruta = `${perfil}/w9/${aleatorio}.${EXT[mime]}.enc`;
  try {
    const cifrado = await cifrar(await claveW9(Deno.env.get('W9_FILE_KEY')), datos);
    const subida = await servicio.storage.from('employee-docs').upload(ruta, cifrado, { contentType: mime, upsert: false });
    if (subida.error) return responder(500, { error: 'server_error' });
  } catch {
    return responder(500, { error: 'server_error' });
  }

  const { data: id, error } = await quien.rpc('register_profile_document', { p_profile: perfil, p_kind: 'w9', p_path: ruta });
  if (error || typeof id !== 'string') {
    await servicio.storage.from('employee-docs').remove([ruta]);
    const { status, error: codigo } = errorDeBase((error as { code?: string } | null)?.code);
    return responder(status, { error: codigo });
  }
  return responder(200, { document_id: id });
});
