// IP de quien llama para la hoja de certificado de firma (B2, revisión de seguridad del hito 8). Primero la cabecera que
// fija la plataforma (cf-connecting-ip); si no está, el ÚLTIMO valor de x-forwarded-for, que agrega el último salto de
// confianza. Nunca el primero: ese lo puede mandar el cliente. Solo se acepta algo con forma de IP (v4 o v6).
const IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9A-Fa-f:]{2,39}(?:%[0-9A-Za-z]+)?)$/;

function limpia(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s && s.length <= 64 && IP.test(s) ? s : null;
}

export function ipDeQuienLlama(headers: { get(name: string): string | null }): string | null {
  const cf = limpia(headers.get('cf-connecting-ip'));
  if (cf) return cf;
  const saltos = (headers.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return limpia(saltos[saltos.length - 1]);
}
