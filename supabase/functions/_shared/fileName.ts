// Nombres legibles de los archivos (D-296): "Cid Clean - {documento} - {de quién o qué} - {fecha o período}.{ext}".
// Para los adjuntos de los correos, el `download=<nombre>` de las URLs firmadas de Storage y el Content-Disposition de
// w9-file. Sin / \ : * ? " < > | ni caracteres de control; los acentos se quedan. La misma regla está en
// app/src/lib/fileName.ts. Los nombres internos en Storage no cambian.

const PREFIJO = 'Cid Clean';
const MAX_BASE = 150;

export function limpiarParte(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    // deno-lint-ignore no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
}

export function nombreLegible(partes: (string | number | null | undefined)[], extension = 'pdf'): string {
  const ext = /^[a-z0-9]{1,5}$/.test(extension.toLowerCase()) ? extension.toLowerCase() : 'pdf';
  const limpias = partes.map(limpiarParte).filter((p) => p !== '');
  if (limpias[0] && limpias[0].toLowerCase().startsWith(PREFIJO.toLowerCase())) {
    const resto = limpiarParte(limpias[0].slice(PREFIJO.length).replace(/^[\s\-·]+/, ''));
    if (resto) limpias[0] = resto;
    else limpias.shift();
  }
  let base = [PREFIJO, ...limpias].join(' - ');
  if (base.length > MAX_BASE) base = base.slice(0, MAX_BASE).trim().replace(/[.\s-]+$/, '');
  return `${base}.${ext}`;
}

/** Fecha AAAA-MM-DD de un ISO o Date (para el nombre). */
export function diaDe(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Content-Disposition con el nombre: ASCII en filename y UTF-8 en filename* (RFC 6266) para los acentos. */
export function disposicion(nombre: string, tipo: 'inline' | 'attachment' = 'inline'): string {
  const ascii = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

// deno-lint-ignore no-explicit-any
type Db = { from: (tabla: string) => any };

/** "Q-0012" del quote (quotes.number), o null si no se encuentra. Con la service role. */
export async function numeroDeQuote(db: Db, quoteId: string | null | undefined): Promise<string | null> {
  if (!quoteId || !/^[0-9a-f-]{36}$/i.test(quoteId)) return null;
  try {
    const { data } = await db.from('quotes').select('number').eq('id', quoteId).maybeSingle();
    return data?.number ? `Q-${String(data.number).padStart(4, '0')}` : null;
  } catch {
    return null;
  }
}

/** D-296: "Cid Clean - Quote Q-0012 v1.2 - Naples Yacht Club.pdf" (sin número si no lo hay). */
export function nombreDeQuote(numero: string | null, version: string | null | undefined, empresa: string | null | undefined, doc = 'Quote'): string {
  return nombreLegible([[doc, numero, version ? `v${version}` : null].filter(Boolean).join(' '), empresa]);
}
