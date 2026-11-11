// site-estimate: validación, anti-spam, límites y correos con Resend simulado (nunca se manda un correo real).
// Uso: node --test supabase/tests/site-estimate.test.mjs (Node 22.18+).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  esSpam, hashIp, manejar, validar, correoCliente, correoInterno, cors, crearToken, tokenValido, claveIp, saludo,
} from '../functions/_shared/siteEstimate.ts';

const NOW = 1_800_000_000_000;
const TOKEN = await crearToken('pimienta', NOW - 9000);

const base = {
  kind: 'estimate', name: 'Ana Prueba', company: '', email: 'Ana@Example.com', phone: '(239) 555-0101',
  city: 'Naples', zip: '34102', type: 'office', sqft: 3000, frequency: 'weekly_3', website: '', token: TOKEN,
};
const OK = { status: 'ok', lead_id: '11111111-1111-1111-1111-111111111111', new_lead: true, type_name: 'Office',
  frequency_name: '3x per week', per_visit: 102, monthly: 1326, range_low: 1130, range_high: 1520, walkthrough_recommended: false, send_customer_mail: true };

function deps(result = OK) {
  const sent = [];
  const calls = [];
  return {
    sent, calls,
    pepper: 'pimienta',
    now: () => NOW,
    submit: async (s, ip) => { calls.push({ s, ip }); return typeof result === 'function' ? result(s) : result; },
    send: async (m) => { sent.push(m); return true; }, // Resend simulado
  };
}
const req = (body, init = {}) => new Request('https://x.supabase.co/functions/v1/site-estimate', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://cidclean.com' }, body: JSON.stringify(body), ...init,
});

test('validar: un estimado correcto', () => {
  const v = validar(base);
  assert.equal(v.ok, true);
  assert.equal(v.data.email, 'ana@example.com');
  assert.equal(v.data.sqft, 3000);
});
test('validar: errores por campo', () => {
  const v = validar({ ...base, name: '', email: 'x', phone: '123', city: 'Miami', zip: '12', sqft: 150, type: 'Bad Key!', frequency: '' });
  assert.equal(v.ok, false);
  assert.deepEqual(Object.keys(v.fields).sort(), ['city', 'email', 'frequency', 'name', 'phone', 'sqft', 'type', 'zip']);
});
test('validar: sq ft como texto con comas y límites', () => {
  assert.equal(validar({ ...base, sqft: '25,000' }).data.sqft, 25000);
  assert.equal(validar({ ...base, sqft: 1_000_001 }).ok, false);
  assert.equal(validar({ ...base, sqft: 200 }).ok, true);
});
test('validar: teléfono de 11 dígitos con 1 y ZIP+4', () => {
  assert.equal(validar({ ...base, phone: '+1 239 555 0101', zip: '34102-1234' }).ok, true);
});
test('validar: contacto pide mensaje', () => {
  assert.equal(validar({ ...base, kind: 'contact', message: 'hola' }).ok, false);
  assert.equal(validar({ ...base, kind: 'contact', message: 'We need cleaning on Saturdays.' }).ok, true);
  assert.equal(validar({ ...base, kind: 'other' }).ok, false);
});
test('anti-spam: campo trampa y token firmado por el servidor (orden 100, punto 3)', async () => {
  assert.equal(await esSpam(base, 'pimienta', NOW), false);
  assert.equal(await esSpam({ ...base, website: 'http://spam' }, 'pimienta', NOW), true);
  assert.equal(await esSpam({ ...base, token: undefined }, 'pimienta', NOW), true);
  // elapsed_ms del cliente ya no cuenta.
  assert.equal(await esSpam({ ...base, token: undefined, elapsed_ms: 999999 }, 'pimienta', NOW), true);
});
test('token: entre 3 s y 2 h, firma con la pimienta y sin manipular', async () => {
  const t = await crearToken('pimienta', NOW);
  assert.match(t, /^v1\.\d+\.[0-9a-f]{64}$/);
  assert.equal(await tokenValido('pimienta', t, NOW + 2999), false);
  assert.equal(await tokenValido('pimienta', t, NOW + 3000), true);
  assert.equal(await tokenValido('pimienta', t, NOW + 2 * 3600 * 1000), true);
  assert.equal(await tokenValido('pimienta', t, NOW + 2 * 3600 * 1000 + 1), false);
  assert.equal(await tokenValido('otra', t, NOW + 5000), false);
  assert.equal(await tokenValido('', t, NOW + 5000), false);
  const [, , sig] = t.split('.');
  assert.equal(await tokenValido('pimienta', `v1.${NOW - 60000}.${sig}`, NOW), false); // hora cambiada
  assert.equal(await tokenValido('pimienta', 'v1.1.zz', NOW), false);
  assert.equal(await tokenValido('pimienta', 42, NOW), false);
});
test('token: GET y POST {kind:"token"} lo entregan; sirve después de 3 s', async () => {
  const d = deps();
  const g = await manejar(new Request('https://x/f', { method: 'GET', headers: { origin: 'https://www.cidclean.com' } }), null, d);
  assert.equal(g.status, 200);
  const { token } = await g.json();
  assert.equal(await tokenValido('pimienta', token, NOW + 3000), true);
  const p = await manejar(req({ kind: 'token' }), null, d);
  assert.match((await p.json()).token, /^v1\./);
  assert.equal(d.calls.length, 0);
  // Recién emitido (menos de 3 s): respuesta silenciosa de spam.
  const r = await manejar(req({ ...base, token }), null, d);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(d.calls.length, 0);
});
test('IP: IPv4 completa, IPv6 por su /64 (orden 100, punto 1)', async () => {
  assert.equal(claveIp('203.0.113.7'), '203.0.113.7');
  assert.equal(claveIp('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(claveIp('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
  assert.equal(claveIp('2001:0db8:0001:0002:ffff:eeee:dddd:cccc'), '2001:db8:1:2::/64');
  assert.equal(claveIp('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(claveIp('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.equal(claveIp('nada'), null);
  assert.equal(claveIp(null), null);
  assert.equal(await hashIp('p', '2001:db8:1:2::1'), await hashIp('p', '2001:db8:1:2:ffff:ffff:ffff:ffff'));
  assert.notEqual(await hashIp('p', '2001:db8:1:2::1'), await hashIp('p', '2001:db8:1:3::1'));
  assert.notEqual(await hashIp('p', '203.0.113.7'), await hashIp('p', '203.0.113.8'));
});
test('sin IP: null para que la base use el balde común "sin IP"', async () => {
  const d = deps();
  await manejar(req(base), null, d);
  assert.equal(d.calls[0].ip, null);
});
test('nombre: se recorta a 60 y el saludo queda genérico con enlaces, http, www. o @ (orden 100, punto 5)', () => {
  const v = validar({ ...base, name: 'A'.repeat(100) });
  assert.equal(v.ok, true);
  assert.equal(v.data.name.length, 60);
  assert.equal(saludo('Ana Prueba'), 'Hi Ana');
  for (const n of ['www.premio.com', 'http://x', 'ana@x.com', 'Visit evil.co/win', 'HTTPS://X', 'hxxp:// ok? httpx']) {
    assert.equal(saludo(n), 'Hi there', n);
  }
  const m = correoCliente(validar({ ...base, name: 'www.premio-malo.com/gana Ana' }).data, OK);
  assert.match(m.text, /^Hi there, here's your estimate/);
  assert.doesNotMatch(m.html, /premio-malo/);
  const x = correoCliente(validar({ ...base, name: '<b>Ana</b>' }).data, OK);
  assert.match(x.html, /Hi &lt;b&gt;Ana&lt;\/b&gt;, here/);
  assert.doesNotMatch(x.html, /<b>Ana/);
});
test('tope global: si la base dice que no, no hay correo al cliente pero sí aviso interno anotado (orden 100, punto 4)', async () => {
  const d = deps({ ...OK, send_customer_mail: false });
  const res = await manejar(req(base), '203.0.113.7', d);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).range_low, 1130);
  assert.equal(d.sent.length, 1);
  assert.equal(d.sent[0].to, 'info@cidclean.com');
  assert.match(d.sent[0].text, /not sent: hourly limit reached/);
  // Sin el campo (respuesta vieja o rara): tampoco se manda.
  const d2 = deps({ ...OK, send_customer_mail: undefined });
  await manejar(req(base), '203.0.113.7', d2);
  assert.equal(d2.sent.length, 1);
  assert.doesNotMatch(correoInterno(validar(base).data, OK).text, /not sent/);
});
test('CORS: sin la vista previa de Pages (orden 100, punto 7)', () => {
  assert.equal(cors('https://cidclean-site.pages.dev')['Access-Control-Allow-Origin'], 'https://cidclean.com');
  assert.equal(cors('https://www.cidclean.com')['Access-Control-Allow-Origin'], 'https://www.cidclean.com');
  assert.match(cors(null)['Access-Control-Allow-Methods'], /GET/);
});
test('hash de IP con pimienta, nunca la IP', async () => {
  const a = await hashIp('p1', '203.0.113.7');
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await hashIp('p2', '203.0.113.7'));
  assert.equal(await hashIp('p1', null), null);
});
test('estimado: crea lead, devuelve rango y manda dos correos (simulados)', async () => {
  const d = deps();
  const res = await manejar(req(base), '203.0.113.7', d);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, range_low: 1130, range_high: 1520, per_visit: 102, walkthrough_recommended: false });
  assert.equal(d.calls[0].ip, await hashIp('pimienta', '203.0.113.7'));
  assert.equal(d.sent.length, 2);
  const cliente = d.sent.find((m) => m.to === 'ana@example.com');
  assert.equal(cliente.subject, 'Your Cid Clean estimate');
  assert.equal(cliente.from, 'Cid Clean <estimates@mail.cidclean.com>');
  assert.equal(cliente.replyTo, 'info@cidclean.com');
  assert.match(cliente.text, /\$1,130 – \$1,520/);
  assert.match(cliente.text, /This is an estimate, not a final price/);
  assert.match(cliente.text, /\(786\) 250-1324/);
  const interno = d.sent.find((m) => m.to === 'info@cidclean.com');
  assert.match(interno.text, /https:\/\/app\.cidclean\.com\/leads\/11111111-1111-1111-1111-111111111111/);
  assert.equal(interno.replyTo, 'ana@example.com');
});
test('contacto: solo el aviso interno', async () => {
  const d = deps({ status: 'ok', lead_id: '22222222-2222-2222-2222-222222222222', new_lead: false });
  const res = await manejar(req({ ...base, kind: 'contact', message: 'Please call me about a walkthrough.' }), null, d);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(d.sent.length, 1);
  assert.match(d.sent[0].subject, /existing lead/);
  // Orden 101 (N2): el aviso no dice que se escribió en las notas y marca la solicitud como sin verificar.
  assert.match(d.sent[0].text, /notes were not changed/);
  assert.match(d.sent[0].text, /unverified/);
  assert.match(d.sent[0].html, /Website requests/);
  assert.doesNotMatch(d.sent[0].text, /added to its notes/);
});
test('robot: responde ok sin crear nada ni mandar correos', async () => {
  for (const b of [{ ...base, website: 'x' }, { ...base, token: 'v1.1.' + 'a'.repeat(64) }, { ...base, token: undefined }]) {
    const d = deps();
    const res = await manejar(req(b), '1.2.3.4', d);
    assert.equal(res.status, 200);
    assert.equal(d.calls.length, 0);
    assert.equal(d.sent.length, 0);
  }
});
test('datos inválidos: 400 con campos, sin tocar la base', async () => {
  const d = deps();
  const res = await manejar(req({ ...base, email: 'nope' }), null, d);
  assert.equal(res.status, 400);
  assert.ok((await res.json()).fields.email);
  assert.equal(d.calls.length, 0);
});
test('límite por IP o correo: 429 sin correos', async () => {
  const d = deps({ status: 'rate_limited' });
  const res = await manejar(req(base), '1.2.3.4', d);
  assert.equal(res.status, 429);
  assert.equal(d.sent.length, 0);
});
test('la base rechaza (tipo desconocido): 400', async () => {
  const res = await manejar(req({ ...base, type: 'castle' }), null, deps({ status: 'invalid' }));
  assert.equal(res.status, 400);
});
test('error de la base: 500; Resend caído no rompe la respuesta', async () => {
  const d1 = deps(() => { throw new Error('db'); });
  assert.equal((await manejar(req(base), null, d1)).status, 500);
  const d2 = deps();
  d2.send = async () => { throw new Error('resend down'); };
  assert.equal((await manejar(req(base), null, d2)).status, 200);
});
test('JSON roto, cuerpo enorme, método y CORS', async () => {
  assert.equal((await manejar(new Request('https://x/f', { method: 'POST', body: '{nope' }), null, deps())).status, 400);
  assert.equal((await manejar(new Request('https://x/f', { method: 'POST', body: 'x'.repeat(20000) }), null, deps())).status, 413);
  assert.equal((await manejar(new Request('https://x/f', { method: 'PUT' }), null, deps())).status, 405);
  const pre = await manejar(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://www.cidclean.com' } }), null, deps());
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://www.cidclean.com');
  assert.equal(cors('https://evil.example')['Access-Control-Allow-Origin'], 'https://cidclean.com');
});
test('correo al cliente recomienda walkthrough sobre 25,000 sq ft', () => {
  const m = correoCliente(validar({ ...base, sqft: 30000 }).data, { ...OK, walkthrough_recommended: true });
  assert.match(m.text, /over 25,000 sq ft/);
  assert.match(m.html, /Your Cid Clean estimate|Estimated monthly range/);
});
