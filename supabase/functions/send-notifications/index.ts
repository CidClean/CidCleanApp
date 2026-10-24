// Correo de los avisos (hito 7, orden 28; D-215). Sin desplegar: lo despliega el arquitecto.
// Lo llama pg_cron cada 5 minutos (supabase/scripts/notificaciones-cron.sql) con la service role como Bearer; nadie
// más puede: la función compara el encabezado con SUPABASE_SERVICE_ROLE_KEY. Cada llamada:
//   1. inmediatos: claim_notification_emails(false) → un correo por aviso;
//   2. resumen diario: claim_notification_emails(true) → desde las 8:00 AM de Naples, un correo por persona con lo
//      acumulado (la base decide la hora).
// Correo desde no-reply@auth.cidclean.com con RESEND_API_KEY (la llave existente de las funciones, D-162). Los textos
// vienen de la base (notification_text), en el idioma de cada persona. Este archivo no contiene llaves.
import { clienteDeServicio, responder } from '../_shared/comun.ts';

type Fila = { id: string; email: string; name: string; language: 'es' | 'en'; kind: string; title: string; detail: string | null; created_at: string };

const FROM = 'Cid Clean <no-reply@auth.cidclean.com>';

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function plantilla(cuerpo: string, pie: string): string {
  return `<!doctype html><html><body style="margin:0;background:#FBF6EF;font-family:Manrope,Arial,sans-serif;color:#1E2A28">
<div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="background:#FFFFFF;border-radius:24px;overflow:hidden">
<div style="background:#0F766E;color:#FFFFFF;padding:14px 16px;font-size:18px;font-weight:700">Cid Clean</div>
<div style="padding:16px;font-size:15px;line-height:1.5">${cuerpo}</div></div>
<p style="font-size:12px;color:#6B5F52;margin:12px 4px">${esc(pie)}</p></div></body></html>`;
}

const T = {
  es: {
    pie: 'Recibes este aviso por tu perfil de Cid Clean. Cámbialo en Mi perfil → Mis notificaciones.',
    resumen: 'Tu resumen de Cid Clean',
    abre: 'Ábrelo en la app.',
  },
  en: {
    pie: 'You get this notice from your Cid Clean profile. Change it in My profile → My notifications.',
    resumen: 'Your Cid Clean summary',
    abre: 'Open it in the app.',
  },
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
  const clave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!clave || req.headers.get('Authorization') !== `Bearer ${clave}`) return responder(403, { error: 'forbidden' });
  const db = clienteDeServicio();
  let enviados = 0;
  let fallidos = 0;

  // 1. Inmediatos.
  const { data: inmediatos, error: e1 } = await db.rpc('claim_notification_emails', { p_digest: false });
  if (e1) return responder(500, { error: 'server_error' });
  for (const f of (inmediatos ?? []) as Fila[]) {
    const t = T[f.language === 'es' ? 'es' : 'en'];
    const cuerpo = `<p style="margin:0 0 6px;font-weight:700">${esc(f.title)}</p>${f.detail ? `<p style="margin:0 0 12px;color:#6B5F52">${esc(f.detail)}</p>` : ''}<p style="margin:0;font-size:13px;color:#6B5F52">${esc(t.abre)}</p>`;
    const ok = await enviar(f.email, f.title, plantilla(cuerpo, t.pie), [f.title, f.detail ?? '', '', t.abre, '', t.pie].join('\n'));
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
    const t = T[filas[0].language === 'es' ? 'es' : 'en'];
    const lista = filas
      .map((f) => `<li style="margin:0 0 8px"><b>${esc(f.title)}</b>${f.detail ? `<br><span style="color:#6B5F52">${esc(f.detail)}</span>` : ''}</li>`)
      .join('');
    const texto = filas.map((f) => `- ${f.title}${f.detail ? `: ${f.detail}` : ''}`).join('\n');
    const ok = await enviar(email, t.resumen, plantilla(`<ul style="margin:0;padding-left:18px">${lista}</ul>`, t.pie), `${t.resumen}\n\n${texto}\n\n${t.pie}`);
    await db.rpc('mark_notification_emails', { p_ids: filas.map((f) => f.id), p_ok: ok });
    if (ok) enviados += filas.length;
    else fallidos += filas.length;
  }

  return responder(200, { sent: enviados, failed: fallidos });
});
