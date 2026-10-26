import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { pieTexto } from './correo.ts';
import { INVITACION_HTML } from './invitacion.ts';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function responder(status: number, cuerpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** Cliente con el JWT de quien llama: las reglas de permisos de la base de datos valen para él. */
export function clienteDeQuienLlama(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente con la service role: solo se usa aquí, dentro de la función, para crear el usuario de Auth y leer perfiles. */
export function clienteDeServicio(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Correo de invitación (D-186 en inglés, D-247; estilo D-250): sin enlaces, desde no-reply@auth.cidclean.com. */
export async function enviarInvitacion(correo: string, nombre: string): Promise<boolean> {
  const html = INVITACION_HTML.replaceAll('{{name}}', escaparHtml(nombre));
  const texto = [
    `Hi ${nombre}, you've been added to the Cid Clean app.`,
    "Open the app, enter this email and we'll send you a 6-digit code to sign in.",
    "If you weren't expecting this invitation, ignore this email.",
    '',
    pieTexto(),
  ].join('\n');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Cid Clean <no-reply@auth.cidclean.com>',
      to: [correo],
      subject: "You're invited to Cid Clean", // D-247: el asunto en inglés de D-186
      html,
      text: texto,
    }),
  });
  return res.ok;
}

/** Traduce el código de error de la base de datos al de la respuesta. */
export function errorDeBase(codigo: string | undefined): { status: number; error: string } {
  switch (codigo) {
    case '42501':
      return { status: 403, error: 'forbidden' };
    case '22023':
      return { status: 400, error: 'invalid' };
    case '23505':
      return { status: 409, error: 'email_taken' };
    case 'P0002':
      return { status: 404, error: 'not_found' };
    default:
      return { status: 500, error: 'server_error' };
  }
}
