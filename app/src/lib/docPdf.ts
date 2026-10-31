import { LOGO_DATA_URI } from '@/components/brand/logoDataUri';

/**
 * Un solo estilo para los PDF que la app arma como HTML con expo-print (orden 70, D-293; muestra en
 * surveys/resumen-pl-pdf-aprobado.html, panel 4): hoja blanca tamaño carta, Helvetica, logo y "Cid Clean LLC" a la
 * izquierda, dirección, teléfono y cidclean.com a la derecha sobre una línea #0F766E, título y subtítulo, tablas con
 * cifras a la derecha y fila de total en negrita, y pie "Generated {fecha} · Cid Clean LLC" con "Page n of m" en cada
 * hoja (cajas de margen de @page). Sin fondo crema ni tarjetas. Reemplaza a pdfBrand.ts (D-250).
 */
export const DOC_ADDRESS = ['3727 Milano Lakes Cir', 'Naples, FL 34114', '(786) 250-1324 · cidclean.com'] as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 31, 2026" (el pie va en inglés como la muestra aprobada). */
export function generatedDate(d: Date = new Date()): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function docCss(o: { landscape?: boolean; generated: string }): string {
  return `
@page{size:letter ${o.landscape ? 'landscape' : 'portrait'};margin:40px 40px 48px;
 @bottom-left{content:${cssString(`Generated ${o.generated} · Cid Clean LLC`)};font:8.5px Helvetica,Arial,sans-serif;color:#777;border-top:1px solid #ccc;vertical-align:top;padding-top:6px}
 @bottom-right{content:"Page " counter(page) " of " counter(pages);font:8.5px Helvetica,Arial,sans-serif;color:#777;border-top:1px solid #ccc;vertical-align:top;padding-top:6px}}
*{box-sizing:border-box}
html,body{background:#FFFFFF}
body{margin:0;font-family:Helvetica,Arial,sans-serif;color:#111111;font-size:11px;line-height:1.35}
.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0F766E;padding-bottom:10px;margin-bottom:14px}
.lg{display:flex;gap:8px;align-items:center}.lg img{width:30px;height:30px}.lg b{color:#0F766E;font-size:15px}
.ad{text-align:right;color:#555555;font-size:9.5px;line-height:1.4}
h1{font-size:17px;margin:0 0 2px}.sub{color:#555555;font-size:10px;margin-bottom:10px}
h2{font-size:12px;margin:16px 0 4px}
table{width:100%;border-collapse:collapse;margin:6px 0 10px}
th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#555555;border-bottom:1px solid #999999;padding:4px 3px;font-weight:700}
td{padding:4px 3px;border-bottom:1px solid #E5E5E5;vertical-align:top}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr{page-break-inside:avoid}
tr.t td{font-weight:700;border-top:1px solid #111111;border-bottom:none}
.note{color:#555555;font-size:9.5px;margin-top:8px}
.muted{color:#777777}
`;
}

export function docHeaderHtml(): string {
  return `<div class="hd"><div class="lg"><img src="${LOGO_DATA_URI}" alt=""><b>Cid Clean LLC</b></div><div class="ad">${DOC_ADDRESS.map(esc).join('<br>')}</div></div>`;
}

export type DocCell = string | { text: string; num?: boolean };
const cellText = (c: DocCell) => (typeof c === 'string' ? c : c.text);
const isNum = (c: DocCell) => typeof c !== 'string' && !!c.num;

/**
 * Tabla del documento. `num` dice qué columnas son cifras (alineadas a la derecha); `total` es la fila de total en
 * negrita. Todo el texto se escapa.
 */
export function docTable(head: readonly string[], rows: readonly (readonly DocCell[])[], o: { num?: readonly number[]; total?: readonly DocCell[] } = {}): string {
  const num = new Set(o.num ?? []);
  const td = (c: DocCell, i: number) => `<td${num.has(i) || isNum(c) ? ' class="n"' : ''}>${esc(cellText(c))}</td>`;
  const th = head.map((h, i) => `<th${num.has(i) ? ' class="n"' : ''}>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map(td).join('')}</tr>`).join('');
  const total = o.total ? `<tr class="t">${o.total.map(td).join('')}</tr>` : '';
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}${total}</tbody></table>`;
}

/** Documento completo: encabezado, título, subtítulo, cuerpo (HTML ya escapado) y pie con página. */
export function docHtml(o: { title: string; subtitle?: string; body: string; landscape?: boolean; css?: string; generated?: Date }): string {
  const generated = generatedDate(o.generated ?? new Date());
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>${docCss({ landscape: o.landscape, generated })}${o.css ?? ''}</style></head><body>${docHeaderHtml()}<h1>${esc(o.title)}</h1>${o.subtitle ? `<div class="sub">${esc(o.subtitle)}</div>` : ''}${o.body}</body></html>`;
}
