import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import { hoursLabel, parseMyHours, rowDate } from './myHours';

describe('Mis horas (D-272, D-274)', () => {
  it('horas como en el survey', () => {
    expect(hoursLabel(880)).toBe('14 h 40 m');
    expect(hoursLabel(960)).toBe('16 h');
    expect(hoursLabel(193)).toBe('3 h 13 m');
    expect(hoursLabel(0)).toBe('0 h');
    expect(hoursLabel(-5)).toBe('0 h');
  });

  it('fecha de la fila "Oct 26"', () => {
    expect(rowDate('2026-10-26', es)).toBe('Oct 26');
    expect(rowDate('2026-01-05', es)).toBe('Ene 5');
    expect(rowDate('2026-01-05', en)).toBe('Jan 5');
  });

  it('lee la respuesta de my_hours', () => {
    const h = parseMyHours({
      month: '2026-10-01',
      rows: [{ date: '2026-10-26', account: 'Naples Yacht Club', worked_minutes: 193, insured_minutes: 240 }],
      worked_minutes: 193,
      insured_minutes: 240,
    });
    expect(h).toEqual({ rows: [{ date: '2026-10-26', account: 'Naples Yacht Club', workedMinutes: 193, insuredMinutes: 240 }], workedMinutes: 193, insuredMinutes: 240 });
    expect(parseMyHours(null)).toEqual({ rows: [], workedMinutes: 0, insuredMinutes: 0 });
  });

  it('textos aprobados y nunca dinero ni tope', () => {
    expect(es.myHours.ofInsured('4 h')).toBe('de 4 h aseguradas');
    expect(es.myHours.note).toBe('Solo el trabajo aprobado. "Aseguradas" son las horas que se te pagan aunque termines antes.');
    expect(en.myHours.ofInsured('4 h')).toBe('of 4 h guaranteed');
    for (const s of [es.myHours, en.myHours]) expect(JSON.stringify(s)).not.toMatch(/\$|32/);
  });
});
