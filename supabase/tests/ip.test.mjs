// IP de la hoja de certificado (B2). Uso: node --test supabase/tests/ip.test.mjs (Node 22.18+).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ipDeQuienLlama } from '../functions/_shared/ip.ts';

const h = (o) => ({ get: (k) => o[k] ?? null });

test('usa cf-connecting-ip si está', () => {
  assert.equal(ipDeQuienLlama(h({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1, 203.0.113.9' })), '203.0.113.7');
});
test('sin cf-connecting-ip, el último salto de x-forwarded-for (no el primero, que manda el cliente)', () => {
  assert.equal(ipDeQuienLlama(h({ 'x-forwarded-for': '6.6.6.6, 198.51.100.4' })), '198.51.100.4');
  assert.equal(ipDeQuienLlama(h({ 'x-forwarded-for': '2001:db8::1' })), '2001:db8::1');
});
test('lo que no tiene forma de IP no se guarda', () => {
  assert.equal(ipDeQuienLlama(h({ 'cf-connecting-ip': '<script>' })), null);
  assert.equal(ipDeQuienLlama(h({ 'x-forwarded-for': '1.2.3.4, not-an-ip' })), null);
  assert.equal(ipDeQuienLlama(h({})), null);
});
