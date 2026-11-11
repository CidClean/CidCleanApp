// site-estimate: validación, anti-spam, límites y correos con Resend simulado (nunca se manda un correo real).
// Uso: node --test supabase/tests/site-estimate.test.mjs (Node 22.18+).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { esSpam, hashIp, manejar, validar, correoCliente, cors } from '../functions/_shared/siteEstimate.ts';

const base = {
  kind: 'estimate', name: 'Ana Prueba', company: '', email: 'Ana@Example.com', phone: '(239) 555-0101',
  city: 'Naples', zip: '34102', type: 'office', sqft: 3000, frequency: 'weekly_3', website: '', elapsed_ms: 9000,
};
const OK = { status: 'ok', lead_id: '11111111-1111-1111-1111-111111111111', new_lead: true, type_name: 'Office',
  frequency_name: '3x per week', per_visit: 102, monthly: 1326, range_low: 1130, range_high: 1520, walkthrough_recommended: false };

function deps(result = OK) {
  const sent = [];
  const calls = [];
  return {
    sent, calls,
    pepper: 'pimienta',
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
test('anti-spam: campo trampa y tiempo mínimo', () => {
  assert.equal(esSpam(base), false);
  assert.equal(esSpam({ ...base, website: 'http://spam' }), true);
  assert.equal(esSpam({ ...base, elapsed_ms: 1200 }), true);
  assert.equal(esSpam({ ...base, elapsed_ms: undefined }), true);
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
});
test('robot: responde ok sin crear nada ni mandar correos', async () => {
  for (const b of [{ ...base, website: 'x' }, { ...base, elapsed_ms: 500 }]) {
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
  assert.equal((await manejar(new Request('https://x/f', { method: 'GET' }), null, deps())).status, 405);
  const pre = await manejar(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://www.cidclean.com' } }), null, deps());
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://www.cidclean.com');
  assert.equal(cors('https://evil.example')['Access-Control-Allow-Origin'], 'https://cidclean.com');
});
test('correo al cliente recomienda walkthrough sobre 25,000 sq ft', () => {
  const m = correoCliente(validar({ ...base, sqft: 30000 }).data, { ...OK, walkthrough_recommended: true });
  assert.match(m.text, /over 25,000 sq ft/);
  assert.match(m.html, /Your Cid Clean estimate|Estimated monthly range/);
});
