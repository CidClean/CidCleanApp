/**
 * Nombres legibles de los archivos que la app comparte, descarga o guarda en la caché del visor (D-296):
 * "Cid Clean - {documento} - {de quién o qué} - {fecha o período}.{ext}". Sin los caracteres que rompen nombres de
 * archivo (/ \ : * ? " < > | y de control); los acentos se quedan. Las partes vacías se omiten.
 * La misma regla está en supabase/functions/_shared/fileName.ts (adjuntos de correo y descargas firmadas).
 */

const PREFIX = 'Cid Clean';
const MAX_BASE = 150;

/** Una parte del nombre sin caracteres prohibidos ni espacios de más. */
export function cleanPart(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
}

/** Período como en D-296: un mes o un año solo, o "desde a hasta". */
export function periodPart(from: string, to?: string | null): string {
  return to && to !== from ? `${from} a ${to}` : from;
}

export function readableFileName(parts: (string | number | null | undefined)[], extension: string): string {
  const ext = /^[a-z0-9]{1,5}$/.test(extension.toLowerCase()) ? extension.toLowerCase() : 'pdf';
  const clean = parts.map(cleanPart).filter((p) => p !== '');
  // Si el documento ya empieza con "Cid Clean" no se repite.
  if (clean[0] && clean[0].toLowerCase().startsWith(PREFIX.toLowerCase())) {
    const rest = cleanPart(clean[0].slice(PREFIX.length).replace(/^[\s\-·]+/, ''));
    if (rest) clean[0] = rest;
    else clean.shift();
  }
  let base = [PREFIX, ...clean].join(' - ');
  if (base.length > MAX_BASE) base = base.slice(0, MAX_BASE).trim().replace(/[.\s-]+$/, '');
  return `${base}.${ext}`;
}

/** Extensión de un nombre de archivo ("" si no tiene). */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}
