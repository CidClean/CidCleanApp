// Cifrado de los archivos del W-9 (D-280): AES-256-GCM con la clave W9_FILE_KEY (32 bytes en base64, secreto de las
// Edge Functions; nunca en el repositorio). Solo usa WebCrypto, así que sirve igual en Deno (funciones) y en Node
// (supabase/scripts/cifrar-w9-existentes.mjs y las pruebas).
// Formato: "CCW9" (4 bytes) · versión 1 (1 byte) · IV aleatorio de 12 bytes · texto cifrado con la etiqueta de 16 bytes.

const MAGIA = [0x43, 0x43, 0x57, 0x39]; // "CCW9"
const VERSION = 1;
const CABECERA = MAGIA.length + 1;
const IV_BYTES = 12;

/** Importa la clave de 32 bytes en base64. Lanza un error si falta o no mide 32 bytes. */
export async function claveW9(base64: string | undefined | null): Promise<CryptoKey> {
  if (!base64) throw new Error('W9_FILE_KEY no está configurada');
  const bin = atob(base64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length !== 32) throw new Error('W9_FILE_KEY debe medir 32 bytes');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** ¿Estos bytes ya están cifrados con este formato? */
export function estaCifrado(datos: Uint8Array): boolean {
  return datos.length > CABECERA + IV_BYTES && MAGIA.every((b, i) => datos[i] === b) && datos[MAGIA.length] === VERSION;
}

export async function cifrar(clave: CryptoKey, datos: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, datos));
  const salida = new Uint8Array(CABECERA + IV_BYTES + cifrado.length);
  salida.set(MAGIA, 0);
  salida[MAGIA.length] = VERSION;
  salida.set(iv, CABECERA);
  salida.set(cifrado, CABECERA + IV_BYTES);
  return salida;
}

/** Descifra; lanza un error si el formato no es el esperado o si el archivo fue alterado (falla la etiqueta GCM). */
export async function descifrar(clave: CryptoKey, datos: Uint8Array): Promise<Uint8Array> {
  if (!estaCifrado(datos)) throw new Error('El archivo no está cifrado con el formato del W-9');
  const iv = datos.slice(CABECERA, CABECERA + IV_BYTES);
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, clave, datos.slice(CABECERA + IV_BYTES));
  return new Uint8Array(plano);
}

/** Tipo del archivo descifrado según la ruta guardada (`….pdf.enc`, `….jpg.enc`). */
export function tipoDeRuta(ruta: string): { ext: string; mime: string } {
  const base = ruta.replace(/\.enc$/, '');
  const ext = (base.split('.').pop() ?? 'pdf').toLowerCase();
  const mime: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp',
  };
  return mime[ext] ? { ext, mime: mime[ext] } : { ext: 'pdf', mime: 'application/pdf' };
}

/** SHA-256 en hex (el enlace de un solo uso solo se guarda como hash). */
export async function sha256Hex(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}
