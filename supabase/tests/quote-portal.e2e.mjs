// Prueba de extremo a extremo del hito 4 contra el proyecto real: armar y enviar un quote (send-quote), el portal
// (quote-portal) y aceptar. No escribe a clientes reales: el contacto es admin@cidclean.com (el dueño) y el correo
// opcional es delivered@resend.dev (dirección de prueba de Resend).
// Uso: SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... NODE_PATH=$(npm root -g) node supabase/tests/quote-portal.e2e.mjs
// Para poder escribir el código sin leer el correo, la prueba pone su propio PORTAL_CODE_PEPPER al empezar y uno
// nuevo y aleatorio al terminar (nadie lo conoce). Borra todo lo que crea; el historial (solo agregar) conserva sus filas.
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const ref = process.env.SUPABASE_PROJECT_REF, tok = process.env.SUPABASE_ACCESS_TOKEN;
const base = `https://${ref}.supabase.co`;
const api = (path, init = {}) => fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, { ...init, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
const keys = await (await api('/api-keys?reveal=true')).json();
const anon = (keys.find((k) => k.name === 'anon') ?? keys.find((k) => k.type === 'publishable')).api_key;
const service = (keys.find((k) => k.name === 'service_role') ?? keys.find((k) => k.type === 'secret')).api_key;
const admin = createClient(base, service, { auth: { persistSession: false } });
const q = async (sql) => (await (await api('/database/query', { method: 'POST', body: JSON.stringify({ query: sql }) })).json());
const out = [];
const ok = (n, c, d = '') => { out.push({ n, c }); console.log(c ? 'OK   ' : 'FALLA', n, d); };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portal = async (body, headers = {}) => {
  const r = await fetch(`${base}/functions/v1/quote-portal`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const setPepper = async (v) => api('/secrets', { method: 'POST', body: JSON.stringify([{ name: 'PORTAL_CODE_PEPPER', value: v }]) });

const pepper = randomBytes(24).toString('base64url');
const ids = {};
try {
  await setPepper(pepper);
  await sleep(8000); // las funciones toman el secreto nuevo
  // Lead, sitio y walkthrough cerrado (como lo deja el hito 3)
  ids.lead = (await q(`insert into leads (company, contact_name, email, language) values ('E2E Quote Prueba', 'Dueño', 'admin@cidclean.com', 'es') returning id`))[0].id;
  ids.site = (await q(`insert into lead_sites (lead_id, name, address) values ('${ids.lead}', 'Sede E2E', '100 Main St, Naples') returning id`))[0].id;
  ids.w = (await q(`select gen_random_uuid() id`))[0].id;
  await q(`insert into walkthroughs (id, site_id, status, current_version, closed_at) values ('${ids.w}', '${ids.site}', 'closed', 1, now());
           insert into walkthrough_versions (walkthrough_id, version, data) values ('${ids.w}', 1,
             '{"contact":{"address":"100 Main St, Naples","contactName":"Dueño E2E","phone":"239 555 0100","email":"admin@cidclean.com","general":""},"areas":[],"frequency":{"kind":"weekly","days":[0,2,4],"other":""},"internal":{"staff":"2","time":"3 h","supplies":""}}')`);

  // Sesión del Super Admin (sin enviar correo: generateLink no lo envía)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'admin@cidclean.com' });
  const app = createClient(base, anon, { auth: { persistSession: false } });
  const v = await app.auth.verifyOtp({ email: 'admin@cidclean.com', token: link.properties.email_otp, type: 'email' });
  ok('sesión del Super Admin', !v.error, v.error?.message ?? '');

  // Armar
  ids.quote = (await app.rpc('ensure_quote', { p_site: ids.site })).data;
  const sq = (await app.rpc('get_site_quote', { p_site: ids.site })).data;
  ids.version = sq.versions[0].id;
  ok('borrador 1.0 con el correo del contacto', sq.versions[0].version === '1.0' && sq.versions[0].contact_email === 'admin@cidclean.com', JSON.stringify(sq.versions[0].contact_email));
  const lines = { services: [{ label: 'Limpieza general', amount: 1650, taxable: true }], addons: [{ label: 'Ventanas', amount: 200, taxable: false }], discounts: [{ label: 'Primer mes', kind: 'percent', value: 5 }] };
  let r = await app.rpc('save_quote_draft', { p_version: ids.version, p_lines: lines, p_tax_rate: 6, p_valid_days: 30, p_recipients: ['delivered@resend.dev'] });
  ok('guardar borrador', !r.error, r.error?.message ?? '');
  let send = await app.functions.invoke('send-quote', { body: { version_id: ids.version } });
  ok('enviar sin SOW: rechazado', !!send.error, '');
  const pdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const sowPath = `${ids.quote}/${ids.version}/sow-e2e.pdf`;
  const up = await app.storage.from('quote-files').upload(sowPath, pdf, { contentType: 'application/pdf' });
  ok('subir el SOW', !up.error, up.error?.message ?? '');
  r = await app.rpc('set_quote_sow', { p_version: ids.version, p_path: sowPath });
  ok('registrar el SOW', !r.error, r.error?.message ?? '');

  // Enviar (PDF + correos: admin@cidclean.com y delivered@resend.dev)
  send = await app.functions.invoke('send-quote', { body: { version_id: ids.version } });
  ok('send-quote: enviado a 2 correos', !send.error && send.data?.sent === 2 && send.data?.failed === 0, JSON.stringify(send.data ?? send.error?.message));
  const row = (await q(`select status, public_token, pdf_path, total::text, expires_at > now() + interval '29 days' vig, snapshot->>'language' lang from quote_versions where id = '${ids.version}'`))[0];
  ids.token = row.public_token;
  ok('quedó Enviado con enlace, PDF, total y vigencia de 30 días', row.status === 'sent' && !!row.public_token && /quote-1\.0\.pdf$/.test(row.pdf_path) && row.total === '1851.55' && row.vig && row.lang === 'es', JSON.stringify(row));
  const pdfFile = await admin.storage.from('quote-files').download(row.pdf_path);
  const pdfBytes = new Uint8Array(await pdfFile.data.arrayBuffer());
  ok('el PDF del quote existe y es un PDF', new TextDecoder().decode(pdfBytes.slice(0, 5)) === '%PDF-' && pdfBytes.length > 2000, String(pdfBytes.length));
  if (process.env.QUOTE_PDF_OUT) require('node:fs').writeFileSync(process.env.QUOTE_PDF_OUT, pdfBytes);
  ok('el lead pasó a Quote enviado', (await q(`select status from leads where id = '${ids.lead}'`))[0].status === 'quote_sent');

  // Portal
  let p = await portal({ action: 'state', token: ids.token });
  ok('portal: estado abierto en español', p.s === 200 && p.j.state === 'open' && p.j.language === 'es', JSON.stringify(p.j));
  p = await portal({ action: 'state', token: 'x'.repeat(30) });
  ok('portal: enlace inexistente', p.j.state === 'not_found', JSON.stringify(p.j));
  p = await portal({ action: 'request', token: ids.token, email: 'otro@prueba.local' });
  ok('portal: un correo que no es del quote recibe la misma respuesta (sin código)', p.s === 200 && (await q(`select count(*)::int n from quote_portal_codes where version_id = '${ids.version}' and email = 'otro@prueba.local'`))[0].n === 0);
  p = await portal({ action: 'request', token: ids.token, email: 'Delivered@resend.dev' });
  ok('portal: el destinatario recibe código (correo enviado)', p.s === 200, JSON.stringify(p.j));
  const code = '482915';
  const setCode = () => q(`update quote_portal_codes set code_hash = '${sha(`${pepper}:${ids.token}:${code}`)}' where id = (select id from quote_portal_codes where version_id = '${ids.version}' and email = 'delivered@resend.dev' order by seq desc limit 1)`);
  await setCode();
  for (let i = 0; i < 4; i++) p = await portal({ action: 'verify', token: ids.token, email: 'delivered@resend.dev', code: '000000' });
  ok('portal: código incorrecto (400)', p.s === 400 && p.j.error === 'wrong', JSON.stringify(p));
  p = await portal({ action: 'verify', token: ids.token, email: 'delivered@resend.dev', code: '000000' });
  ok('portal: al 5º fallo queda bloqueado (423)', p.s === 423 && p.j.error === 'locked', JSON.stringify(p));
  p = await portal({ action: 'verify', token: ids.token, email: 'delivered@resend.dev', code });
  ok('portal: bloqueado aunque sea el correcto', p.s === 423, JSON.stringify(p));
  p = await portal({ action: 'request', token: ids.token, email: 'delivered@resend.dev' });
  await setCode();
  p = await portal({ action: 'verify', token: ids.token, email: 'delivered@resend.dev', code });
  ok('portal: código nuevo correcto abre sesión', p.s === 200 && !!p.j.session, JSON.stringify(p.j).slice(0, 80));
  const session = p.j.session;
  p = await portal({ action: 'quote', session });
  const keysOut = Object.keys(p.j);
  ok('portal: la cotización del cliente, sin datos internos', p.s === 200 && p.j.total === 1851.55 && p.j.company === 'E2E Quote Prueba'
    && !keysOut.some((k) => ['internal', 'sent_by', 'recipients', 'contact_email', 'sow_path', 'pdf_path', 'walkthrough_version'].includes(k)), keysOut.join(','));
  ok('portal: quedó Visto', (await q(`select status from quote_versions where id = '${ids.version}'`))[0].status === 'viewed');
  p = await portal({ action: 'quote', session: 'y'.repeat(40) });
  ok('portal: sesión inventada no ve nada (401)', p.s === 401);
  p = await portal({ action: 'decide', session, kind: 'accepted', name: 'Dueño E2E', title: 'Gerente', read_confirmed: true });
  ok('portal: aceptar sin abrir el SOW: rechazado (400)', p.s === 400, JSON.stringify(p));
  p = await portal({ action: 'file', session, kind: 'sow' });
  const sow = p.j.url ? await fetch(p.j.url) : null;
  ok('portal: el SOW se entrega con URL firmada', sow?.status === 200, String(sow?.status));
  p = await portal({ action: 'file', session, kind: 'pdf' });
  ok('portal: el PDF del quote se descarga', p.s === 200 && (await fetch(p.j.url)).status === 200);
  p = await portal({ action: 'decide', session, kind: 'accepted', name: 'Dueño E2E', title: 'Gerente', read_confirmed: true }, { 'user-agent': 'E2E navegador' });
  ok('portal: aceptar', p.s === 200 && p.j.kind === 'accepted', JSON.stringify(p));
  const dec = (await q(`select d.signer_name, d.signer_title, d.ip is not null ip, d.user_agent, d.sow_read_at is not null sow, v.status from quote_decisions d join quote_versions v on v.id = d.version_id where d.version_id = '${ids.version}'`))[0];
  ok('aceptación registrada: nombre, cargo, IP, navegador y lectura del SOW', dec.signer_name === 'Dueño E2E' && dec.signer_title === 'Gerente' && dec.ip && dec.user_agent === 'E2E navegador' && dec.sow && dec.status === 'accepted', JSON.stringify(dec));
  const js = (await q(`select c.name, j.id, j.contact_email, r.monthly_rate::text rate, (select count(*) from jobsite_documents d where d.jobsite_id = j.id and d.kind = 'sow')::int docs, l.status from jobsites j join clients c on c.id = j.client_id join jobsite_rates r on r.jobsite_id = j.id join leads l on l.id = c.lead_id where j.site_id = '${ids.site}'`))[0];
  ids.jobsite = js?.id;
  ok('nace el Cliente con su Jobsite, la tarifa, el SOW copiado y el lead Ganado', js?.name === 'E2E Quote Prueba' && js.rate === '1851.55' && js.docs === 1 && js.status === 'won' && js.contact_email === 'admin@cidclean.com', JSON.stringify(js));
  p = await portal({ action: 'state', token: ids.token });
  ok('portal: después dice que ya está decidido', p.j.state === 'decided', JSON.stringify(p.j));
  p = await portal({ action: 'decide', session, kind: 'rejected', reason_id: null });
  ok('portal: una segunda decisión no se acepta', p.s >= 400);
} finally {
  // Limpieza: archivos, jobsite, cliente, quote y lead de prueba. Pepper nuevo que nadie conoce.
  await setPepper(randomBytes(32).toString('base64url'));
  try {
    for (const b of ['quote-files', 'jobsite-docs']) {
      const prefix = b === 'quote-files' ? `${ids.quote}/${ids.version}` : ids.jobsite;
      if (!prefix || prefix.includes('undefined')) continue;
      const l = await admin.storage.from(b).list(prefix);
      if (l.data?.length) await admin.storage.from(b).remove(l.data.map((o) => `${prefix}/${o.name}`));
    }
  } catch {}
  if (ids.lead) {
    await q(`delete from jobsite_documents where jobsite_id in (select id from jobsites where site_id = '${ids.site}');
             delete from jobsite_rates where jobsite_id in (select id from jobsites where site_id = '${ids.site}');
             delete from jobsites where site_id = '${ids.site}';
             delete from clients where lead_id = '${ids.lead}';
             delete from quotes where site_id = '${ids.site}';
             delete from leads where id = '${ids.lead}';`);
  }
  const resto = (await q(`select (select count(*) from leads where company like 'E2E%') leads, (select count(*) from quotes) quotes, (select count(*) from clients) clients,
    (select count(*) from storage.objects where bucket_id in ('quote-files','jobsite-docs')) objetos, (select count(*) from walkthroughs where id = '${ids.w ?? '00000000-0000-0000-0000-000000000000'}') wt`))[0];
  console.log('Limpieza lista; restos:', JSON.stringify(resto));
}
console.log(out.filter((x) => !x.c).length, 'fallan de', out.length);
