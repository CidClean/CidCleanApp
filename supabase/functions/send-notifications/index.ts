// Correo de los avisos (hito 7, orden 28; D-215). Sin desplegar: lo despliega el arquitecto.
// Lo llama pg_cron cada 5 minutos (supabase/scripts/notificaciones-cron.sql) con la service role como Bearer; nadie
// más puede: la función compara el encabezado con SUPABASE_SERVICE_ROLE_KEY. Cada llamada:
//   1. inmediatos: claim_notification_emails(false) → un correo por aviso;
//   2. resumen diario: claim_notification_emails(true) → desde las 8:00 AM de Naples, un correo por persona con lo
//      acumulado (la base decide la hora).
// Correo desde no-reply@auth.cidclean.com con RESEND_API_KEY (la llave existente de las funciones, D-162). Los textos
// vienen de la base (notification_text), siempre en inglés (D-247, migración 20261027000012), con el estilo de D-250
// (_shared/correo.ts). Este archivo no contiene llaves.
import { clienteDeServicio, responder } from '../_shared/comun.ts';
import { correoHtml, esc, filas as filasHtml, nota, pieTexto, titulo } from '../_shared/correo.ts';

const filas_ = (f: Fila[]) => filasHtml(f.map((x) => ({ title: x.title, detail: x.detail })));

type Fila = { id: string; email: string; name: string; language: 'es' | 'en'; kind: string; title: string; detail: string | null; created_at: string };

const FROM = 'Cid Clean <no-reply@auth.cidclean.com>';

// Textos D-200.
const T = {
  pie: 'You get this notice from your Cid Clean profile. Change it in My profile → My notifications.',
  resumen: 'Your Cid Clean summary',
  abre: 'Open it in the app.',
};

async function enviar(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder(405, { error: 'method_not_allowed' });
  // Solo el cron de la base: trae en x-cidclean-cron el secreto CIDCLEAN_CRON_SECRET (guardado también en Vault).
  const clave = Deno.env.get('CIDCLEAN_CRON_SECRET') ?? '';
  if (clave.length < 32 || req.headers.get('x-cidclean-cron') !== clave) return responder(403, { error: 'forbidden' });
  const db = clienteDeServicio();
  let enviados = 0;
  let fallidos = 0;

  // 1. Inmediatos.
  const { data: inmediatos, error: e1 } = await db.rpc('claim_notification_emails', { p_digest: false });
  if (e1) return responder(500, { error: 'server_error' });
  for (const f of (inmediatos ?? []) as Fila[]) {
    const cuerpo = titulo(f.title, 22) +
      (f.detail ? `<div style="font-size:15px;line-height:1.55;color:#4A4038;margin:0 0 14px">${esc(f.detail)}</div>` : '') +
      nota(esc(T.abre));
    const html = correoHtml({ preview: [f.title, f.detail].filter(Boolean).join(' · '), tarjeta: cuerpo, nota: T.pie });
    const ok = await enviar(f.email, f.title, html, [f.title, f.detail ?? '', '', T.abre, '', pieTexto(T.pie)].join('\n'));
    await db.rpc('mark_notification_emails', { p_ids: [f.id], p_ok: ok });
    if (ok) enviados++;
    else fallidos++;
  }

  // 2. Resumen diario: un correo por persona.
  const { data: resumen, error: e2 } = await db.rpc('claim_notification_emails', { p_digest: true });
  if (e2) return responder(500, { error: 'server_error' });
  const porPersona = new Map<string, Fila[]>();
  for (const f of (resumen ?? []) as Fila[]) porPersona.set(f.email, [...(porPersona.get(f.email) ?? []), f]);
  for (const [email, filas] of porPersona) {
    const texto = filas.map((f) => `- ${f.title}${f.detail ? `: ${f.detail}` : ''}`).join('\n');
    const html = correoHtml({
      preview: `${T.resumen}: ${filas.length}`,
      tarjeta: titulo(T.resumen, 22) + filas_(filas) + nota(esc(T.abre), '14px'),
      nota: T.pie,
    });
    const ok = await enviar(email, T.resumen, html, `${T.resumen}\n\n${texto}\n\n${T.abre}\n\n${pieTexto(T.pie)}`);
    await db.rpc('mark_notification_emails', { p_ids: filas.map((f) => f.id), p_ok: ok });
    if (ok) enviados += filas.length;
    else fallidos += filas.length;
  }

  return responder(200, { sent: enviados, failed: fallidos });
});
