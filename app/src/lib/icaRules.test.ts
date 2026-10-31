import { getIcaStrings } from '@/i18n/ica';

import { hour12, icaInfoFromRow, offerFromRow, warningsFromRow, windowEnd } from './icaApi';
import { freqCount, freqLetters, icaPill, rateText, shortName } from './icaRules';

jest.mock('./supabase', () => ({ supabase: {} }));

// D-292: ICA opcional (ficha neutra "Sin ICA"), ofertas y advertencias como surveys/ica-ofertas-aprobado.html.
const es = getIcaStrings('es');
const en = getIcaStrings('en');

describe('ICA, ofertas y advertencias', () => {
  it('sin ICA es una ficha neutra, no un pendiente', () => {
    expect(icaPill({ state: 'none' }, es)).toEqual({ label: 'Sin ICA', tone: 'neutral' });
    expect(icaPill({ state: 'sent' }, es)).toEqual({ label: 'Enviado', tone: 'warn' });
    expect(icaPill({ state: 'signed' }, es).tone).toBe('ok');
    expect(icaInfoFromRow({ state: 'none', w9_signed: false, can_manage: true, agreement: null }).agreement).toBeNull();
  });

  it('franja, frecuencia y pago como la muestra', () => {
    expect(hour12('23:00')).toBe('11:00 pm');
    expect(hour12(windowEnd('23:00', 240))).toBe('3:00 am');
    const f = { kind: 'weekly', days: [6, 0, 1, 3, 4, 5] };
    expect(freqLetters(f, es)).toBe('L, M, J, V, S, D');
    expect(freqCount(f, es)).toBe('6 días por semana');
    expect(freqCount(f, en)).toBe('6 days per week');
    expect(rateText(80)).toBe('$80');
    expect(rateText(82.5)).toBe('$82.50');
    expect(shortName('Karina Salazar')).toBe('Karina S.');
    expect(es.offerDetail('Naples Yacht Club', '11:00 pm', '3:00 am', '6 días por semana', '$80')).toBe(
      'Naples Yacht Club · Franja de acceso del cliente 11:00 pm – 3:00 am · 6 días por semana · $80 por día de servicio',
    );
  });

  it('lee ofertas y advertencias de la base', () => {
    const o = offerFromRow({ id: 'o', profile_id: 'p', contractor: 'Karina S', kind: 'visit', jobsite_id: 'j', jobsite: 'NYC', visit_date: '2026-11-02',
      start_date: null, window_start: '23:00', window_end: '03:00', frequency: null, rate: '110.00', status: 'pending', offered_at: '2026-10-31T12:00:00Z',
      response_source: null });
    expect([o.kind, o.rate, o.windowEnd]).toEqual(['visit', 110, '03:00']);
    const w = warningsFromRow({ active_count: 2, can_manage: true, items: [{ id: 'w', issued_on: '2026-10-12', reason: 'x', has_document: true, status: 'active' }] });
    expect([w.activeCount, w.items[0].hasDocument, es.countOf3(w.activeCount)]).toEqual([2, true, '2 de 3']);
    expect(es.noConsequence).toBe('Puedes aceptar o rechazar sin ninguna consecuencia.');
  });
});
