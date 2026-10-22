import {
  cleanRecipients,
  computeTotals,
  frequencyText,
  parseAmount,
  quoteActions,
  sendBlockers,
  shortDate,
  statusTone,
  toVersion,
  validateLines,
  type QuoteLines,
  type QuoteVersion,
} from './quoteRules';

const L = (o: Partial<QuoteLines>): QuoteLines => ({ services: [], addons: [], discounts: [], ...o });

describe('totales (D-077, D-122, D-209): iguales a quote_totals de la base', () => {
  test('tax solo sobre lo gravable', () => {
    expect(computeTotals(L({ services: [{ label: 'A', amount: 600, taxable: true }], addons: [{ label: 'B', amount: 400, taxable: false }] }), 6)).toEqual({
      subtotal: 1000, discount: 0, tax: 36, total: 1036,
    });
  });
  test('descuento en % antes del tax, repartido sobre lo gravable', () => {
    expect(
      computeTotals(L({ services: [{ label: 'A', amount: 600, taxable: true }], addons: [{ label: 'B', amount: 400, taxable: false }], discounts: [{ label: 'P', kind: 'percent', value: 10 }] }), 6),
    ).toEqual({ subtotal: 1000, discount: 100, tax: 32.4, total: 932.4 });
  });
  test('descuento en monto: el caso de las pruebas SQL (1500 − 100, tax 6% sobre 1200)', () => {
    expect(
      computeTotals(L({ services: [{ label: 'A', amount: 1200, taxable: true }], addons: [{ label: 'B', amount: 300, taxable: false }], discounts: [{ label: 'X', kind: 'amount', value: 100 }] }), 6),
    ).toEqual({ subtotal: 1500, discount: 100, tax: 67.2, total: 1467.2 });
  });
  test('el descuento no pasa del subtotal y sin renglones todo es 0', () => {
    expect(computeTotals(L({ services: [{ label: 'A', amount: 100, taxable: true }], discounts: [{ label: 'X', kind: 'amount', value: 250 }] }), 6).total).toBe(0);
    expect(computeTotals(L({}), 6)).toEqual({ subtotal: 0, discount: 0, tax: 0, total: 0 });
  });
});

describe('armado', () => {
  test('cada renglón con nombre y monto; % hasta 100; al menos un servicio', () => {
    const e = validateLines(L({ services: [{ label: ' ', amount: 1, taxable: true }], addons: [{ label: 'B', amount: null, taxable: false }], discounts: [{ label: 'P', kind: 'percent', value: 120 }] }));
    expect([...e.lines].sort()).toEqual(['addons.0', 'discounts.0', 'services.0']);
    expect(validateLines(L({})).noService).toBe(true);
    expect(validateLines(L({ services: [{ label: 'A', amount: 0, taxable: true }] })).lines.size).toBe(0);
  });
  test('montos escritos', () => {
    expect(parseAmount('1,200.50')).toBe(1200.5);
    expect(parseAmount('$80')).toBe(80);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('1.234')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
  test('correos opcionales sin repetir, en minúsculas y sin el del contacto (D-209)', () => {
    expect(cleanRecipients([' A@X.com ', 'a@x.com', 'c@x.com', 'b@x.com'], 'c@x.com')).toEqual(['a@x.com', 'b@x.com']);
  });
});

const v = (o: Partial<QuoteVersion>): QuoteVersion => ({
  id: 'v', version: '1.0', minor: 0, status: 'draft', lines: L({}), taxRate: 6, validDays: 30, totals: null, contactEmail: 'c@x.com',
  recipients: [], hasSow: false, sowPath: null, pdfPath: null, sentAt: null, sentBy: null, expiresAt: null, viewedAt: null, decidedAt: null,
  decision: null, ...o,
});

describe('acciones según estado y permisos (D-007, D-209)', () => {
  test('borrador: armar y enviar', () => {
    expect(quoteActions(v({}), { edit: true, send: true })).toEqual({ edit: true, send: true, newVersion: false, resend: false });
    expect(quoteActions(v({}), { edit: false, send: false })).toEqual({ edit: false, send: false, newVersion: false, resend: false });
  });
  test('enviado o visto: reenviar el correo y versión nueva', () => {
    expect(quoteActions(v({ status: 'viewed' }), { edit: true, send: true })).toEqual({ edit: false, send: false, newVersion: true, resend: true });
  });
  test('vencido: renovar crea versión nueva; aceptado no', () => {
    expect(quoteActions(v({ status: 'expired' }), { edit: true, send: true }).newVersion).toBe(true);
    expect(quoteActions(v({ status: 'accepted' }), { edit: true, send: true }).newVersion).toBe(false);
  });
  test('qué falta para enviar', () => {
    expect(sendBlockers(v({ contactEmail: null }))).toEqual(['service', 'sow', 'recipient']);
    expect(sendBlockers(v({ hasSow: true, lines: L({ services: [{ label: 'A', amount: 1, taxable: true }] }) }))).toEqual([]);
  });
  test('fichas: abiertos en marca, Aceptado verde, Cambios pedidos ámbar y cerrados en gris', () => {
    expect(statusTone('sent')).toBe('brand');
    expect(statusTone('accepted')).toBe('success');
    expect(statusTone('changes_requested')).toBe('warning');
    expect(statusTone('superseded')).toBe('muted');
  });
});

describe('textos', () => {
  test('frecuencia (D-075, D-080, D-105)', () => {
    expect(frequencyText({ kind: 'weekly', days: [4, 0, 2], other: '' }, 'es')).toBe('Semanal: Lun, Mié, Vie · 3 veces por semana');
    expect(frequencyText({ kind: 'daily', days: [], other: '' }, 'en')).toBe('Daily · 7 times a week');
    expect(frequencyText({ kind: 'other', days: [], other: 'Dos veces al mes' }, 'es')).toBe('Dos veces al mes');
    expect(frequencyText(null, 'es')).toBe('');
  });
  test('fecha corta', () => {
    expect(shortDate(new Date(2026, 10, 19, 12).toISOString(), 'es')).toBe('19 nov 2026');
    expect(shortDate(new Date(2026, 10, 19, 12).toISOString(), 'en')).toBe('Nov 19, 2026');
  });
  test('fila de la API: sin precios los montos quedan null', () => {
    const r = toVersion({ id: 'x', version: '1.1', minor: 1, status: 'sent', lines: { services: [{ label: 'A', taxable: true }] }, total: null, has_sow: true });
    expect(r.totals).toBeNull();
    expect(r.lines.services[0]).toEqual({ label: 'A', amount: null, taxable: true });
    expect(r.hasSow).toBe(true);
  });
});
