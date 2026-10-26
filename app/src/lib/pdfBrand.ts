import { LOGO_DATA_URI } from '@/components/brand/logoDataUri';

/**
 * Encabezado y pie con la marca para los PDF que arma la app con expo-print (orden 33, D-248, D-250; copia de
 * surveys/marca-aprobado/quote-pdf.html): logo (data URI) con "Cid Clean LLC" y "Commercial cleaning · Naples, FL",
 * franja de degradado y pie con los datos de contacto (D-249). Se usan en el PDF del horario y en el de Accounting.
 */
export const BRAND_PDF_CSS = `
.cc-top{display:flex;justify-content:space-between;align-items:flex-start}
.cc-brand{display:flex;gap:12px;align-items:center}.cc-brand img{width:58px;height:58px}
.cc-brand b{display:block;font-size:22px;font-weight:800;color:#0F766E;letter-spacing:-.3px}.cc-brand span{color:#6B5F52;font-size:11px}
.cc-qn{text-align:right}.cc-qn .k{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#8A4B0F}.cc-qn .v{font-size:20px;font-weight:800}
.cc-band{margin:18px 0 16px;height:6px;border-radius:6px;background:linear-gradient(90deg,#0F766E,#2FB8AE 60%,#BFE9E4)}
.cc-foot{margin-top:18px;padding-top:12px;border-top:1px solid #EFE5D8;display:flex;justify-content:space-between;color:#6B5F52;font-size:10px;line-height:1.6}
.cc-foot b{color:#1E2A28}
`;

const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Logo y nombre a la izquierda; a la derecha, opcional, una etiqueta en ámbar con su valor (por ejemplo el periodo). */
export function brandHeaderHtml(right?: { label: string; value: string }): string {
  const r = right ? `<div class="cc-qn"><div class="k">${esc(right.label)}</div><div class="v">${esc(right.value)}</div></div>` : '';
  return `<div class="cc-top"><div class="cc-brand"><img src="${LOGO_DATA_URI}" alt=""><div><b>Cid Clean LLC</b><span>Commercial cleaning · Naples, FL</span></div></div>${r}</div><div class="cc-band"></div>`;
}

export function brandFooterHtml(right = ''): string {
  return `<div class="cc-foot"><div><b>Cid Clean LLC</b> · cidclean.com<br>(786) 250-1324 · humbertovp@cidclean.com<br>Instagram · Facebook · TikTok · LinkedIn</div><div style="text-align:right">${esc(right)}</div></div>`;
}
