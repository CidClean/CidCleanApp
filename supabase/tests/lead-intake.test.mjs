// lead-intake: clave, lote, limpieza, nombres de campo de Meta/TikTok y respuestas, con la base simulada.
// Uso: node --test supabase/tests/lead-intake.test.mjs (Node 22.18+).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clean, hashKey, manejar, normalizeLead, normalizePhone, KEY_HEADER } from '../functions/_shared/leadIntake.ts';

const KEY = 'ccl_' + '0123456789abcdef'.repeat(3); // clave falsa de prueba
const OK = { status: 'ok', created: 1, merged: 0, rejected: 0, errors: [] };

function deps(result = OK) {
  const calls = [];
  return { calls, intake: async (h, leads) => { calls.push({ h, leads }); return typeof result === 'function' ? result(leads) : result; } };
}
const req = (body, key = KEY, method = 'POST') => new Request('https://x.supabase.co/functions/v1/lead-intake', {
  method, headers: { 'content-type': 'application/json', ...(key ? { [KEY_HEADER]: key } : {}) },
  body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
});

test('sin clave o con clave mal formada: 401 sin detalles y sin tocar la base', async () => {
  for (const k of [null, 'abc', 'ccl_XYZ']) {
    const d = deps();
    const r = await manejar(req({ email: 'a@b.co' }, k), d);
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { error: 'unauthorized' });
    assert.equal(d.calls.length, 0);
  }
});
test('clave que la base no reconoce o fuente apagada: 401', async () => {
  const r = await manejar(req({ email: 'a@b.co' }), deps({ status: 'unauthorized' }));
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: 'unauthorized' });
});
test('la base recibe el SHA-256 de la clave, nunca la clave', async () => {
  const d = deps();
  await manejar(req({ email: 'a@b.co', full_name: 'Ana' }), d);
  assert.equal(d.calls[0].h, await hashKey(KEY));
  assert.match(d.calls[0].h, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(d.calls).includes(KEY));
});
test('solo POST; JSON malo; lote vacío o de más de 200', async () => {
  assert.equal((await manejar(req(null, KEY, 'GET'), deps())).status, 405);
  assert.equal((await manejar(req('{no json'), deps())).status, 400);
  assert.equal((await manejar(req([]), deps())).status, 400);
  const muchos = Array.from({ length: 201 }, (_, i) => ({ email: `x${i}@b.co`, full_name: 'X' }));
  const r = await manejar(req(muchos), deps());
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'too_many');
});
test('acepta un lead, una lista o { leads: [...] }', async () => {
  for (const body of [{ email: 'a@b.co' }, [{ email: 'a@b.co' }, { email: 'c@d.co' }], { leads: [{ email: 'a@b.co' }] }]) {
    const d = deps();
    const r = await manejar(req(body), d);
    assert.equal(r.status, 200);
    assert.equal(d.calls[0].leads.length, Array.isArray(body) ? body.length : body.leads ? body.leads.length : 1);
  }
});
test('responde con conteo creados / juntados / rechazados', async () => {
  const r = await manejar(req([{ email: 'a@b.co' }]), deps({ status: 'ok', created: 2, merged: 1, rejected: 1, errors: [{ index: 3, reason: 'contact_missing' }] }));
  assert.deepEqual(await r.json(), { ok: true, created: 2, merged: 1, rejected: 1, errors: [{ index: 3, reason: 'contact_missing' }] });
});
test('límite por clave: 429; error de la base: 500', async () => {
  assert.equal((await manejar(req({ email: 'a@b.co' }), deps({ status: 'rate_limited' }))).status, 429);
  assert.equal((await manejar(req({ email: 'a@b.co' }), { intake: async () => { throw new Error('x'); } })).status, 500);
});
test('nombres de campo de Meta y TikTok', () => {
  const l = normalizeLead({ full_name: 'Maria Gonzalez', phone_number: '+12395550142', email: 'MARIA@Example.com', company_name: 'MG LLC', platform: 'ig' });
  assert.equal(l.contact_name, 'Maria Gonzalez');
  assert.equal(l.phone, '(239) 555-0142');
  assert.equal(l.email, 'maria@example.com');
  assert.equal(l.company, 'MG LLC');
  assert.equal(l.source_detail, 'ig');
});
test('limpieza: sin HTML, recortes, servicio y propiedad', () => {
  const l = normalizeLead({ company: '<script>alert(1)</script>Gulf <b>Dental</b>', contact_name: 'x'.repeat(200), email: 'no-es-correo',
    zip: '3410', service: 'One-time', property: 'Residential', notes: 'Line 1\nLine 2<img src=x>', city: ' Naples ' });
  assert.equal(l.company, 'alert(1) Gulf Dental');
  assert.equal(l.contact_name.length, 80);
  assert.equal(l.email, '');
  assert.equal(l.zip, '');
  assert.equal(l.service, 'one_time');
  assert.equal(l.property, 'residential');
  assert.equal(l.notes, 'Line 1\nLine 2');
  assert.equal(l.city, 'Naples');
  assert.equal(clean(12345, 10), '12345');
});
test('teléfono D-216: válidos e inválidos', () => {
  assert.equal(normalizePhone('239.555.0142'), '(239) 555-0142');
  assert.equal(normalizePhone('1 (239) 555-0142'), '(239) 555-0142');
  assert.equal(normalizePhone('(123) 456-7890'), '');
  assert.equal(normalizePhone('555-0142'), '');
});
test('cuerpo demasiado grande: 413', async () => {
  const r = await manejar(req({ notes: 'x'.repeat(600 * 1024), email: 'a@b.co' }), deps());
  assert.equal(r.status, 413);
});
