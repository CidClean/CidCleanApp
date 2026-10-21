// Prueba de extremo a extremo del bucket terms (D-176): sube solo el Super Admin; lee cualquier empleado.
// No publica ninguna versión (terms_documents es de solo agregar): el objeto de prueba se borra con la service role.
// Uso: SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... NODE_PATH=$(npm root -g) node supabase/tests/terms-storage.e2e.mjs
// Lee las llaves de la API con el token en tiempo de ejecución; no guarda ninguna. Borra todo lo que crea (el historial conserva sus filas).
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const ref = process.env.SUPABASE_PROJECT_REF, tok = process.env.SUPABASE_ACCESS_TOKEN;
const base = `https://${ref}.supabase.co`;
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
const anon = (keys.find((k) => k.name === 'anon') ?? keys.find((k) => k.type === 'publishable')).api_key;
const service = (keys.find((k) => k.name === 'service_role') ?? keys.find((k) => k.type === 'secret')).api_key;
const admin = createClient(base, service, { auth: { persistSession: false } });
const out = [];
const ok = (n, c, d = '') => { out.push({ n, c, d }); console.log(c ? 'OK   ' : 'FALLA', n, d); };
const q = async (sql) => (await (await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) })).json());
async function sesion(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const c = createClient(base, anon, { auth: { persistSession: false } });
  const r = await c.auth.verifyOtp({ email, token: data.properties.email_otp, type: 'email' });
  if (r.error) throw r.error;
  return r.data.session.access_token ? c : null;
}
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const ruta = `staff/e2e-${Date.now()}.pdf`;
try {
  await q(`insert into profiles (full_name, worker_type, email) values ('E2E Empleado', 'w2', 'e2e-empleado@prueba.local')`);
  await admin.auth.admin.createUser({ email: 'e2e-empleado@prueba.local', email_confirm: true });
  const sup = await sesion('admin@cidclean.com');
  const emp = await sesion('e2e-empleado@prueba.local');
  let r = await emp.storage.from('terms').upload(ruta, PDF, { contentType: 'application/pdf' });
  ok('empleado: no sube al bucket terms', !!r.error, r.error?.message ?? 'subió');
  r = await sup.storage.from('terms').upload(`staff/e2e-no-pdf-${Date.now()}.txt`, new TextEncoder().encode('hola'), { contentType: 'text/plain' });
  ok('Super Admin: un archivo que no es PDF se rechaza', !!r.error, r.error?.message ?? 'subió');
  r = await sup.storage.from('terms').upload(ruta, PDF, { contentType: 'application/pdf' });
  ok('Super Admin: sube un PDF al bucket terms', !r.error, r.error?.message ?? '');
  r = await sup.storage.from('terms').upload(ruta, PDF, { contentType: 'application/pdf', upsert: true });
  ok('Super Admin: no reemplaza un archivo ya subido (sin política de update)', !!r.error, r.error?.message ?? 'reemplazó');
  const f = await emp.storage.from('terms').createSignedUrl(ruta, 60);
  ok('empleado: firma una URL de corta duración del PDF', !f.error && /\/object\/sign\/terms\//.test(f.data?.signedUrl ?? ''), f.error?.message ?? '');
  const bytes = f.data?.signedUrl ? await fetch(f.data.signedUrl) : null;
  const buf = bytes ? new Uint8Array(await bytes.arrayBuffer()) : new Uint8Array();
  ok('la URL firmada entrega el PDF', bytes?.status === 200 && new TextDecoder().decode(buf.slice(0, 5)) === '%PDF-', String(bytes?.status));
  r = await emp.storage.from('terms').remove([ruta]);
  const sigue = (await q(`select count(*) as n from storage.objects where bucket_id = 'terms' and name = '${ruta}'`))[0].n;
  ok('empleado: no borra el PDF', Number(sigue) === 1, JSON.stringify(r.error ?? r.data));
  r = await sup.storage.from('terms').remove([ruta]);
  const sigue2 = (await q(`select count(*) as n from storage.objects where bucket_id = 'terms' and name = '${ruta}'`))[0].n;
  ok('Super Admin: tampoco borra desde la API', Number(sigue2) === 1);
  const sinSesion = await fetch(`${base}/storage/v1/object/terms/${ruta}`, { headers: { apikey: anon } });
  ok('sin sesión no se lee el PDF', sinSesion.status >= 400, String(sinSesion.status));
} finally {
  await admin.storage.from('terms').remove([ruta]);
  await q(`delete from profiles where email = 'e2e-empleado@prueba.local'`);
  const us = (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.filter((u) => /@prueba\.local$/.test(u.email ?? ''));
  for (const u of us) await admin.auth.admin.deleteUser(u.id);
  const resto = (await q(`select (select count(*) from storage.objects where bucket_id = 'terms') as objetos, (select count(*) from terms_documents) as versiones, (select count(*) from profiles where email like '%@prueba.local') as perfiles`))[0];
  console.log('Limpieza lista; restos:', JSON.stringify(resto));
}
console.log(out.filter((x) => !x.c).length, 'fallan de', out.length);
