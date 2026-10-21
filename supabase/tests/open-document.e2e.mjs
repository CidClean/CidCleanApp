// Prueba de extremo a extremo de D-125: los documentos de los 1099 solo se abren con la Edge Function open-document.
// Uso: SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... NODE_PATH=$(npm root -g) node supabase/tests/open-document.e2e.mjs
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
  return { jwt: r.data.session.access_token, cliente: c };
}
async function abrir(jwt, body) {
  const r = await fetch(`${base}/functions/v1/open-document`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const aperturas = async (doc) => Number((await q(`select count(*) as n from change_log where action = 'documento_abierto' and entity_id = '${doc}'`))[0].n);

let objetivo = null;
const creados = [];
try {
  await q(`insert into profiles (full_name, worker_type, email) values ('E2E Con Pagos', 'w2', 'e2e-con-pagos@prueba.local'), ('E2E Sin Pagos', 'w2', 'e2e-sin-pagos@prueba.local')`);
  await q(`insert into profile_permissions (profile_id, permission_key) select id, 'empleados_ver_pagos' from profiles where email = 'e2e-con-pagos@prueba.local'`);
  for (const e of ['e2e-con-pagos@prueba.local', 'e2e-sin-pagos@prueba.local']) await admin.auth.admin.createUser({ email: e, email_confirm: true });
  objetivo = (await q(`insert into profiles (full_name, worker_type, has_app_access) values ('E2E Objetivo 1099', '1099', false) returning id`))[0].id;

  const sup = await sesion('admin@cidclean.com');
  const con = await sesion('e2e-con-pagos@prueba.local');
  const sin = await sesion('e2e-sin-pagos@prueba.local');
  const ruta = `${objetivo}/w9/e2e.pdf`;

  // Subir sigue funcionando sin la política de lectura (el insert no la necesita).
  let up = await sup.cliente.storage.from('employee-docs').upload(ruta, PDF, { contentType: 'application/pdf' });
  ok('subir (Super Admin, política de insert): funciona sin política de lectura', !up.error, up.error?.message ?? '');
  const reg = await sup.cliente.rpc('register_profile_document', { p_profile: objetivo, p_kind: 'w9', p_path: ruta });
  ok('register_profile_document registra el archivo subido', !reg.error && !!reg.data, reg.error?.message ?? '');
  const doc = reg.data;
  up = await con.cliente.storage.from('employee-docs').upload(`${objetivo}/w9/e2e-con-pagos.pdf`, PDF, { contentType: 'application/pdf' });
  ok('subir (empleados_ver_pagos): sigue permitido', !up.error, up.error?.message ?? '');

  // Quien tiene empleados_ver_pagos NO lee ni firma directo desde Storage.
  const firma = await con.cliente.storage.from('employee-docs').createSignedUrl(ruta, 60);
  ok('con empleados_ver_pagos: NO puede firmar una URL directo desde Storage', !!firma.error && !firma.data?.signedUrl, firma.error?.message ?? 'firmó');
  const firmas = await con.cliente.storage.from('employee-docs').createSignedUrls([ruta], 60);
  ok('con empleados_ver_pagos: NO puede firmar varias URLs', !!firmas.error || (firmas.data ?? []).every((f) => !f.signedUrl), JSON.stringify(firmas.error ?? firmas.data));
  const desc = await con.cliente.storage.from('employee-docs').download(ruta);
  ok('con empleados_ver_pagos: NO puede descargar directo', !!desc.error && !desc.data, desc.error?.message ?? 'descargó');
  const lista = await con.cliente.storage.from('employee-docs').list(`${objetivo}/w9`);
  ok('con empleados_ver_pagos: NO ve la lista de archivos', !lista.error && (lista.data ?? []).length === 0, JSON.stringify(lista.error ?? lista.data));
  const firmaSup = await sup.cliente.storage.from('employee-docs').createSignedUrl(ruta, 60);
  ok('el Super Admin tampoco firma directo desde Storage', !!firmaSup.error && !firmaSup.data?.signedUrl, firmaSup.error?.message ?? 'firmó');
  const pub = await fetch(`${base}/storage/v1/object/public/employee-docs/${ruta}`);
  ok('el bucket es privado: la URL pública no sirve el archivo', pub.status >= 400, String(pub.status));
  const sinAuth = await fetch(`${base}/storage/v1/object/employee-docs/${ruta}`, { headers: { apikey: anon } });
  ok('sin sesión no se lee el archivo directo', sinAuth.status >= 400, String(sinAuth.status));

  // open-document
  const antes0 = await aperturas(doc);
  let r = await abrir(sin.jwt, { document_id: doc });
  ok('open-document: sin empleados_ver_pagos -> 403', r.s === 403 && !r.j.url, JSON.stringify(r.j));
  r = await abrir(anon, { document_id: doc });
  ok('open-document: con la llave anónima -> 403', r.s === 403 && !r.j.url, JSON.stringify(r.j));
  r = await fetch(`${base}/functions/v1/open-document`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ document_id: doc }) });
  ok('open-document: sin JWT -> 401', r.status === 401, String(r.status));
  r = await abrir(sup.jwt, { document_id: 'no-uuid' });
  ok('open-document: id inválido -> 400', r.s === 400, JSON.stringify(r.j));
  r = await abrir(sup.jwt, { document_id: '00000000-0000-4000-8000-000000000000' });
  ok('open-document: documento inexistente -> 404', r.s === 404, JSON.stringify(r.j));
  ok('los intentos rechazados no dejan aperturas en el historial', (await aperturas(doc)) === antes0);

  r = await abrir(sup.jwt, { document_id: doc });
  ok('open-document: con permiso -> 200 con URL firmada de 60 s', r.s === 200 && /\/object\/sign\/employee-docs\//.test(r.j.url ?? '') && r.j.expires_in === 60, JSON.stringify(r.j).slice(0, 120));
  const bytes = r.j.url ? await fetch(r.j.url) : null;
  const buf = bytes ? new Uint8Array(await bytes.arrayBuffer()) : new Uint8Array();
  ok('la URL firmada entrega el PDF', bytes?.status === 200 && new TextDecoder().decode(buf.slice(0, 5)) === '%PDF-', String(bytes?.status));
  ok('cada apertura deja una fila en change_log (1)', (await aperturas(doc)) === antes0 + 1);
  await abrir(sup.jwt, { document_id: doc });
  ok('cada apertura deja una fila en change_log (2)', (await aperturas(doc)) === antes0 + 2);
  const fila = (await q(`select actor_id = (select id from profiles where is_super_admin) as actor_ok, detail->>'profile_id' as perfil, detail->>'kind' as tipo, at > now() - interval '2 minutes' as reciente from change_log where action = 'documento_abierto' and entity_id = '${doc}' order by id desc limit 1`))[0];
  ok('la fila dice quién, qué perfil y tipo, y cuándo', fila.actor_ok && fila.perfil === objetivo && fila.tipo === 'w9' && fila.reciente, JSON.stringify(fila));
} finally {
  // Limpieza: objetos de Storage, documentos, perfiles y usuarios de prueba (change_log, de solo agregar, conserva sus filas).
  try { if (objetivo) { const l = await admin.storage.from('employee-docs').list(`${objetivo}/w9`); await admin.storage.from('employee-docs').remove((l.data ?? []).map((o) => `${objetivo}/w9/${o.name}`)); } } catch {}
  if (objetivo) await q(`delete from profiles where id = '${objetivo}'`);
  await q(`delete from profiles where email in ('e2e-con-pagos@prueba.local', 'e2e-sin-pagos@prueba.local')`);
  const us = (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.filter((u) => /@prueba\.local$/.test(u.email ?? ''));
  for (const u of us) await admin.auth.admin.deleteUser(u.id);
  const resto = (await q(`select (select count(*) from storage.objects where bucket_id = 'employee-docs') as objetos, (select count(*) from profiles where email like '%@prueba.local') as perfiles, (select count(*) from profile_documents) as docs`))[0];
  console.log('Limpieza lista; usuarios de prueba borrados:', us.length, 'restos:', JSON.stringify(resto));
}
console.log(out.filter((x) => !x.c).length, 'fallan de', out.length);
