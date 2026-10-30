// Pruebas de las piezas del contrato del cliente que no usan pdf-lib (orden 62, D-283): plantilla 1.0, relleno, filas
// del certificado y correos. Uso: node --test supabase/tests/contrato.test.mjs   (Node 22.18 o más nuevo).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { AUTOMATICAS, camposDe, filasCertificadoContrato, llaves, rellenar, sha256Bytes } from '../functions/_shared/contrato.ts';
import { correoContrato, correoContratoFirmado, correoCopiaAceptacion, REMITENTE_DOCUMENTOS } from '../functions/_shared/contratoCorreos.ts';
import { CONSENT_TEXT, PLANTILLA, TEMPLATE_VERSION } from '../functions/_shared/legal/csa-sow-1.0.ts';

const sql = readFileSync(new URL('../migrations/20261030000013_contratos.sql', import.meta.url), 'utf8');
const editables = [...sql.slice(sql.indexOf('create function contract_editable_keys'), sql.indexOf('create function contract_mmddyyyy'))
  .matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
const textos = PLANTILLA.flatMap((b) => ('text' in b ? [b.text] : 'rows' in b ? b.rows.flat() : []));

test('la plantilla usa solo llaves que existen en la base o son automáticas', () => {
  const usadas = new Set(textos.flatMap(llaves));
  for (const k of usadas) assert.ok(editables.includes(k) || AUTOMATICAS.includes(k), `llave sin origen: ${k}`);
  // Y todos los campos editables (menos el cargo de Cid Clean, que va en la firma) aparecen en el texto.
  for (const k of editables.filter((x) => x !== 'cc_title' && x !== 'client_legal_name')) assert.ok(usadas.has(k), `campo sin usar: ${k}`);
});

test('plantilla 1.0 sin la marca de borrador y con el texto legal clave', () => {
  const todo = textos.join('\n');
  assert.equal(TEMPLATE_VERSION, '1.0');
  assert.ok(!/Draft rev\. 3/.test(todo));
  for (const frase of [
    'accepting a quote is not a contract',
    'JURY TRIAL WAIVER: EACH PARTY KNOWINGLY AND VOLUNTARILY WAIVES ANY RIGHT TO A TRIAL BY JURY',
    'placement fee of $2,500 per person',
    'Collier County, Florida',
    'E-SIGN Act; s. 668.50, Fla. Stat.',
    'an e-signature certificate page (name, verified email, date and time, IP address, browser, and consent to sign electronically) is attached as the last page.',
  ]) assert.ok(todo.includes(frase), frase);
});

test('rellenar reemplaza las llaves y deja una línea si falta algo', () => {
  assert.equal(rellenar('Client: {{client_email}}; x {{nada}}', { client_email: 'a@b.co' }), 'Client: a@b.co; x ____________');
});

test('camposDe agrega números de CSA, SOW y quote', () => {
  const c = camposDe({ csa: 'CSA-0003', sow: 'SOW-0003', quote_number: 'Q-0010', quote_version: '1.2', template_version: '1.0', fields: { price: '$1' } });
  assert.equal(rellenar('{{sow_no}} {{csa_no}} {{quote_no}} v{{quote_version}} SOW v{{sow_version}} {{price}}', c), 'SOW-0003 CSA-0003 Q-0010 v1.2 SOW v1.2 $1');
});

test('certificado: nombre, correo verificado, fecha y hora con zona, IP, navegador, consentimiento y contrafirma', () => {
  const at = new Date('2026-11-02T14:05:09Z');
  const filas = Object.fromEntries(filasCertificadoContrato({
    csa: 'CSA-0001', sow: 'SOW-0001', pdfSha256: 'a'.repeat(64), signatureId: 'id-1',
    cliente: { name: 'Ana Ruiz', title: 'Manager', email: 'ana@x.com', at, ip: '1.2.3.4', userAgent: 'UA', signatureId: 's' },
    cidClean: { name: 'Humberto V.', title: 'Managing Member', email: 'admin@cidclean.com', at, ip: null, userAgent: null },
    sentAt: at, sentBy: 'Humberto V.',
  }));
  assert.equal(filas['Client signer'], 'Ana Ruiz, Manager');
  assert.match(filas['Verified email'], /ana@x\.com .*6-digit code/);
  assert.match(filas['Client signed on'], /November 2, 2026, 9:05:09 AM EST \(America\/New_York\) · 2026-11-02 14:05:09 UTC/);
  assert.equal(filas['Client IP address'], '1.2.3.4');
  assert.equal(filas['Client browser'], 'UA');
  assert.ok(filas['Consent to sign electronically'].includes(CONSENT_TEXT));
  assert.match(filas['Countersigned by'], /Humberto V\., Managing Member, Cid Clean LLC/);
});

test('correos en inglés: copia de la aceptación, link de firma y contrato firmado', () => {
  const a = correoCopiaAceptacion({ quoteNumber: 'Q-0001', version: '1.0', company: 'Acme', site: 'HQ', signer: 'Ana', title: 'CEO', email: 'a@x.co',
    acceptedAt: new Date('2026-10-30T13:00:00Z'), total: 1272, extra: false, acceptanceText: 'I have read the Scope of Work and accept quote Q-0001…',
    termsVersion: '1.0', userAgent: 'UA' });
  assert.equal(a.subject, 'Copy of your acceptance: quote Q-0001 version 1.0');
  assert.match(a.text, /not a contract/);
  assert.match(a.text, /free paper copy/);
  assert.match(a.html, /\$1,272\.00/);
  const l = correoContrato({ name: 'Ana Ruiz', company: 'Acme', csa: 'CSA-0001', link: 'https://quote.cidclean.com/contract/t', expires: 'Nov 14, 2026' });
  assert.match(l.html, /Review and sign/);
  assert.match(l.text, /expires on Nov 14, 2026/);
  const f = correoContratoFirmado({ company: 'Acme', csa: 'CSA-0001', sow: 'SOW-0001', signedAt: new Date(), paraCidClean: true });
  assert.match(f.text, /can now be scheduled/);
  assert.equal(REMITENTE_DOCUMENTOS, 'Cid Clean <documents@mail.cidclean.com>');
});

test('sha256 en hex', async () => {
  assert.equal(await sha256Bytes(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
