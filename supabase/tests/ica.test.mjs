// Pruebas de las piezas del ICA que no usan pdf-lib (orden 65, D-285): plantilla 1.0 contra el PDF del abogado,
// llaves contra la base, filas del certificado y correos. Uso: node --test supabase/tests/ica.test.mjs (Node 22.18+).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { rellenar, llaves } from '../functions/_shared/contrato.ts';
import { AUTOMATICAS_ICA, camposDeIca, filasCertificadoIca } from '../functions/_shared/ica.ts';
import { correoCodigoIca, correoIca, correoIcaFirmado } from '../functions/_shared/icaCorreos.ts';
import { ICA_TEMPLATE_VERSION, icaConsentText, PLANTILLA_ICA } from '../functions/_shared/legal/ica-1.0.ts';

const sql = readFileSync(new URL('../migrations/20261031000002_ica.sql', import.meta.url), 'utf8');
const editables = [...sql.slice(sql.indexOf('create function ica_editable_keys'), sql.indexOf('create function ica_required_keys'))
  .matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
const textos = PLANTILLA_ICA.flatMap((b) => ('text' in b ? [b.text] : 'rows' in b ? [...b.head, ...b.rows.flat()] : []));
const normal = (s) => s.replace(/\s+/g, ' ').trim();

test('la plantilla usa solo llaves de la base o automáticas, y usa todas', () => {
  const usadas = new Set(textos.flatMap(llaves));
  for (const k of usadas) assert.ok(editables.includes(k) || AUTOMATICAS_ICA.includes(k), `llave sin origen: ${k}`);
  for (const k of editables.filter((x) => !['cc_title', 'business_name'].includes(x))) assert.ok(usadas.has(k), `campo sin usar: ${k}`);
});

test('el texto es el del PDF del abogado (sin la marca de borrador)', () => {
  let pdf;
  try {
    pdf = execFileSync('pdftotext', ['-raw', new URL('../../legal/rev3/6_Independent_Contractor_Agreement_EN.pdf', import.meta.url).pathname, '-'], { encoding: 'utf8' });
  } catch {
    return; // sin pdftotext no se compara
  }
  const fuente = normal(pdf.replace(/•/g, ' ').replace(/Draft rev\. 3 – final review/g, '').replace(/Cid Clean LLC · Independent Contractor Agreement Page \d of 5/g, ''));
  assert.equal(ICA_TEMPLATE_VERSION, '1.0');
  for (const b of PLANTILLA_ICA) {
    if (!('text' in b) || b.text.includes('{{')) continue;
    assert.ok(fuente.includes(normal(b.text)), `no está en el PDF: ${b.text.slice(0, 60)}`);
    assert.ok(!/Draft rev\. 3/.test(b.text));
  }
});

test('relleno con los datos del contratista', () => {
  const c = camposDeIca({ ica: 'ICA-0001', template_version: '1.0', fields: { contractor_name: 'Ana Pérez', contractor_entity: 'an individual',
    contractor_address: '10 Palm Ave, Naples, FL 34102', contractor_email: 'ana@x.com', contractor_phone: '(239) 555-0100', effective_date: '11/01/2026' } });
  const p = PLANTILLA_ICA.find((b) => b.t === 'p');
  assert.match(rellenar(p.text, c), /and Ana Pérez, an individual, 10 Palm Ave, Naples, FL 34102, ana@x.com, \(239\) 555-0100 \("Contractor"\)/);
  assert.equal(rellenar(PLANTILLA_ICA[2].text, c), 'Template version: 1.0 · Agreement No.: ICA-0001 · Effective date of this Agreement: 11/01/2026');
});

test('certificado con correo verificado, IP, navegador y consentimiento', () => {
  const f = Object.fromEntries(filasCertificadoIca({
    ica: 'ICA-0001', pdfSha256: 'a'.repeat(64), signatureId: 'sig',
    contratista: { name: 'Ana Pérez', email: 'ana@x.com', at: new Date('2026-11-01T14:00:00Z'), ip: '1.2.3.4', userAgent: 'UA', signatureId: 's1' },
    cidClean: { name: 'Humberto', title: 'Managing Member', email: 'admin@cidclean.com', at: new Date('2026-11-02T14:00:00Z'), ip: null, userAgent: null },
    sentAt: null, sentBy: null,
  }));
  assert.match(f['Verified email'], /ana@x.com \(verified with a one-time 6-digit code/);
  assert.equal(f['Contractor IP address'], '1.2.3.4');
  assert.equal(f['Contractor browser'], 'UA');
  assert.ok(f['Consent to sign electronically'].includes(icaConsentText()));
  assert.match(f['Contractor signed on'], /November 1, 2026/);
});

test('correos en inglés con el link y sin llaves', () => {
  const e = correoIca({ name: 'Ana Pérez', ica: 'ICA-0001', link: 'https://quote.cidclean.com/ica/tok', expires: 'November 15, 2026' });
  assert.match(e.subject, /Independent Contractor Agreement ICA-0001/);
  assert.ok(e.html.includes('https://quote.cidclean.com/ica/tok') && e.text.includes('expires on November 15, 2026'));
  assert.ok(correoCodigoIca('123456').html.includes('123456'));
  const f = correoIcaFirmado({ contractor: 'Ana', ica: 'ICA-0001', signedAt: new Date(), paraCidClean: false });
  assert.match(f.text, /free paper copy/);
  assert.match(correoIcaFirmado({ contractor: 'Ana', ica: 'ICA-0001', signedAt: new Date(), paraCidClean: false, paper: true }).text, /signed paper copy/);
});
