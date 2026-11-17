// Recordatorio del quote (orden 121): correo y envío con Resend simulado (nunca se manda un correo real).
// Uso: node --test supabase/tests/quote-reminder.test.mjs (Node 22.18+).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { correoRecordatorio, enviarRecordatorios, FROM_QUOTES, PIE_C_QUOTE, REPLY_TO_QUOTES } from '../functions/_shared/quoteReminder.ts';

const R = {
  version_id: 'v1', step: 3, to: 'Ana@Cliente.com', token: 'tok-nuevo', company: 'Naples Yacht Club', site: 'Marina',
  address: '1 Main St, Naples, FL 34102', contact_name: 'Ana Pérez', version: '1.0', expires_at: '2026-12-01T15:00:00Z',
};

function deps(lista, sendOk = true) {
  const sent = [];
  const marks = [];
  return {
    sent, marks,
    claim: async () => lista,
    send: async (m) => { sent.push(m); return typeof sendOk === 'function' ? sendOk(m) : sendOk; },
    mark: async (v, s, ok) => { marks.push([v, s, ok]); },
    base: 'https://quote.cidclean.com/',
  };
}

test('correo: enlace nuevo al portal, marca y pie C', () => {
  const m = correoRecordatorio(R, 'https://quote.cidclean.com');
  assert.equal(m.subject, 'Reminder: your Cid Clean quote for Naples Yacht Club');
  assert.ok(m.text.includes('View quote: https://quote.cidclean.com/q/tok-nuevo'));
  assert.ok(m.html.includes('href="https://quote.cidclean.com/q/tok-nuevo"'));
  assert.ok(m.text.startsWith('A quick reminder, Ana'));
  assert.ok(m.text.includes('Dec 1, 2026'));
  for (const l of PIE_C_QUOTE) assert.ok(m.text.includes(l));
  assert.ok(m.html.includes('This is a service message about your quote with Cid Clean LLC.'));
  assert.ok(m.html.includes('3727 Milano Lakes Cir, Naples, FL 34114'));
  assert.ok(m.html.includes('#FBF6EF') && m.html.includes('instagram.com/cidclean') && m.html.includes('share/1HYRBdqPmq'));
  assert.ok(!m.html.includes('tiktok'));
  assert.ok(!m.text.includes('advertisement'));
});

test('correo de 7 días con otro texto', () => {
  const m = correoRecordatorio({ ...R, step: 7 }, 'https://quote.cidclean.com');
  assert.ok(m.text.includes('is still open'));
});

test('envía uno por versión, solo al contacto, desde quotes@ con Reply-To info@, y marca', async () => {
  const d = deps([R, { ...R, version_id: 'v2', step: 7, to: 'luis@cliente.com', token: 't2' }]);
  const r = await enviarRecordatorios(d);
  assert.deepEqual(r, { sent: 2, failed: 0 });
  assert.equal(d.sent.length, 2);
  assert.deepEqual(d.sent[0].to, ['ana@cliente.com']);
  assert.deepEqual(d.sent[1].to, ['luis@cliente.com']);
  assert.equal(d.sent[0].from, FROM_QUOTES);
  assert.equal(d.sent[0].from, 'Cid Clean <quotes@mail.cidclean.com>');
  assert.equal(d.sent[0].reply_to, REPLY_TO_QUOTES);
  assert.deepEqual(d.marks, [['v1', 3, true], ['v2', 7, true]]);
});

test('si Resend falla, se marca como fallido y no se reintenta en la misma pasada', async () => {
  const d = deps([R], false);
  assert.deepEqual(await enviarRecordatorios(d), { sent: 0, failed: 1 });
  assert.equal(d.sent.length, 1);
  assert.deepEqual(d.marks, [['v1', 3, false]]);
});

test('sin correo válido no manda nada y lo marca', async () => {
  const d = deps([{ ...R, to: 'no-es-correo' }, { ...R, version_id: 'v3', to: '' }]);
  assert.deepEqual(await enviarRecordatorios(d), { sent: 0, failed: 2 });
  assert.equal(d.sent.length, 0);
  assert.deepEqual(d.marks.map((m) => m[2]), [false, false]);
});

test('una excepción de Resend cuenta como fallo', async () => {
  const d = deps([R], () => { throw new Error('red'); });
  assert.deepEqual(await enviarRecordatorios(d), { sent: 0, failed: 1 });
});

test('nada que reclamar: no manda', async () => {
  const d = deps([]);
  assert.deepEqual(await enviarRecordatorios(d), { sent: 0, failed: 0 });
  assert.equal(d.sent.length, 0);
});
