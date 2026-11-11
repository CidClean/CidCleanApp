// Estimador y contacto del sitio cidclean.com (orden 91; D-307, D-309). Pública: verify_jwt desactivado
// (desplegar con --no-verify-jwt). Toda la lógica está en _shared/siteEstimate.ts; la base (site_submit, solo
// service role) limita por IP y por correo, calcula con las tarifas vigentes y crea el lead.
import { clienteDeServicio } from '../_shared/comun.ts';
import { ipDeQuienLlama } from '../_shared/ip.ts';
import { manejar, type Submission, type SubmitResult } from '../_shared/siteEstimate.ts';

Deno.serve((req) => {
  const db = clienteDeServicio();
  return manejar(req, ipDeQuienLlama(req.headers), {
    pepper: Deno.env.get('PORTAL_CODE_PEPPER') ?? '',
    submit: async (s: Submission, ipHash: string | null) => {
      const { data, error } = await db.rpc('site_submit', {
        p_kind: s.kind, p_name: s.name, p_company: s.company, p_email: s.email, p_phone: s.phone, p_city: s.city,
        p_zip: s.zip, p_type: s.type, p_sqft: s.sqft, p_frequency: s.frequency, p_message: s.message, p_ip_hash: ipHash,
      });
      if (error) throw new Error(error.message);
      return data as SubmitResult;
    },
    send: async (m) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${Deno.env.get('RESEND_QUOTES_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: m.from, to: [m.to], reply_to: m.replyTo, subject: m.subject, html: m.html, text: m.text }),
      });
      return res.ok;
    },
  });
});
