// Armazón común de los correos de Cid Clean (D-247, D-248, D-249, D-250): siempre en inglés, fondo #FBF6EF, logo de
// 44 px con "Cid Clean" en Manrope 800 #0F766E, tarjeta blanca de 24 px y el pie con los datos de la empresa y las
// redes como enlaces de texto. Copia de surveys/marca-aprobado/quote-email.html y code-email.html. Este archivo no
// contiene llaves.

/** Logo público del bucket `brand` (supabase/scripts/bucket-brand.md). */
export const LOGO_URL = 'https://noammaqhtdfgbheeiugo.supabase.co/storage/v1/object/public/brand/logo-192.png';

export const EMPRESA = {
  nombre: 'Cid Clean LLC',
  linea: 'Cid Clean LLC · Commercial cleaning · Naples, FL',
  web: 'cidclean.com',
  webUrl: 'https://cidclean.com',
  telefono: '(786) 250-1324',
  telefonoUrl: 'tel:+17862501324',
  correo: 'humbertovp@cidclean.com',
  redes: [
    ['Instagram', 'https://www.instagram.com/cidclean'],
    ['Facebook', 'https://www.facebook.com/share/1DizxHgUY9/'],
    ['TikTok', 'https://www.tiktok.com/@cid.clean'],
    ['LinkedIn', 'https://www.linkedin.com/company/cidclean/'],
  ] as const,
};

export function esc(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ENLACE = 'color:#0F766E;text-decoration:none;font-weight:700';

/** Pie de los correos (D-249, D-250). `nota` es una línea extra arriba (por ejemplo, de dónde sale un aviso). */
export function pieHtml(nota?: string): string {
  const redes = EMPRESA.redes.map(([n, u]) => `<a href="${u}" style="${ENLACE}">${n}</a>`).join(' &nbsp;·&nbsp; ');
  return `<tr><td style="padding:22px 6px 0;font-size:13px;line-height:1.6;color:#6B5F52">
${nota ? `<div style="padding-bottom:10px">${esc(nota)}</div>` : ''}<div style="font-weight:800;color:#1E2A28">${EMPRESA.linea}</div>
<div><a href="${EMPRESA.webUrl}" style="${ENLACE}">${EMPRESA.web}</a></div>
<div><a href="${EMPRESA.telefonoUrl}" style="color:#6B5F52;text-decoration:none">${EMPRESA.telefono}</a> &nbsp;·&nbsp; <a href="mailto:${EMPRESA.correo}" style="color:#6B5F52;text-decoration:none">${EMPRESA.correo}</a></div>
<div style="padding-top:8px">${redes}</div>
</td></tr>`;
}

export function pieTexto(nota?: string): string {
  return [
    ...(nota ? [nota, ''] : []),
    EMPRESA.linea,
    EMPRESA.web,
    `${EMPRESA.telefono} · ${EMPRESA.correo}`,
    EMPRESA.redes.map(([n, u]) => `${n}: ${u}`).join('\n'),
  ].join('\n');
}

/**
 * Correo completo: `preview` es el texto oculto que muestran las bandejas; `tarjeta` es el HTML de dentro de la
 * tarjeta blanca (ya escapado).
 */
export function correoHtml(o: { preview: string; tarjeta: string; nota?: string; logo?: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#FBF6EF;font-family:Manrope,'Segoe UI',Arial,sans-serif;color:#1E2A28">
<div style="display:none;max-height:0;overflow:hidden">${esc(o.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF6EF"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 6px 16px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle"><img src="${o.logo ?? LOGO_URL}" width="44" height="44" alt="Cid Clean" style="display:block;border:0"></td>
<td style="vertical-align:middle;padding-left:10px;font-size:20px;font-weight:800;color:#0F766E;letter-spacing:-0.2px">Cid Clean</td></tr></table></td></tr>
<tr><td style="background:#FFFFFF;border-radius:24px;padding:26px 24px">${o.tarjeta}</td></tr>
${pieHtml(o.nota)}</table></td></tr></table></body></html>`;
}

// Piezas de la tarjeta, con los tamaños aprobados.
export const titulo = (t: string, size = 24) =>
  `<div style="font-size:${size}px;font-weight:800;line-height:1.25;margin:0 0 8px">${esc(t)}</div>`;
export const parrafo = (html: string) =>
  `<div style="font-size:15px;line-height:1.55;color:#4A4038;margin:0 0 20px">${html}</div>`;
export const nota = (html: string, margen = '0') =>
  `<div style="font-size:13px;line-height:1.5;color:#6B5F52;margin-top:${margen}">${html}</div>`;
export const boton = (texto: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 10px"><tr><td style="background:#0F766E;border-radius:14px"><a href="${esc(url)}" style="display:inline-block;padding:14px 26px;color:#FFFFFF;font-size:16px;font-weight:800;text-decoration:none">${esc(texto)}</a></td></tr></table>`;
export const codigoGrande = (code: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#DDEFEC;border-radius:18px"><tr><td align="center" style="padding:22px 12px;font-size:38px;font-weight:800;letter-spacing:10px;color:#0F766E">${esc(code)}</td></tr></table>`;
export const firma = (antes: string) =>
  `<div style="font-size:15px;line-height:1.5;margin-top:20px">${esc(antes)}<br><b>${EMPRESA.nombre}</b></div>`;

/** Filas con título en negrita y detalle gris, separadas por una línea (servicios del quote, lista del resumen). */
export function filas(items: { title: string; detail?: string | null }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items
    .map(
      (i) =>
        `<tr><td style="padding:10px 0;border-top:1px solid #EFE5D8"><div style="font-size:15px;font-weight:700;color:#1E2A28">${esc(i.title)}</div>${
          i.detail ? `<div style="font-size:13px;color:#6B5F52">${esc(i.detail)}</div>` : ''
        }</td></tr>`,
    )
    .join('')}</table>`;
}
