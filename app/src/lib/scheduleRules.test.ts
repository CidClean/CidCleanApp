import { atTime, clockOutAfter, workedMinutes } from './scheduleRules';

describe('Turno que cruza la medianoche (D-241)', () => {
  it('una salida antes de la entrada es del día siguiente: 11:00 PM a 3:00 AM son 4 h', () => {
    const cin = atTime('2026-09-17', 23, 0);
    const cout = clockOutAfter(cin, atTime('2026-09-17', 3, 0));
    expect(cout.getDate()).toBe(18);
    expect(cout.getHours()).toBe(3);
    expect(workedMinutes(cin, cout)).toBe(240);
  });
  it('una salida igual a la entrada también pasa al día siguiente', () => {
    const cin = atTime('2026-09-17', 23, 0);
    expect(workedMinutes(cin, clockOutAfter(cin, atTime('2026-09-17', 23, 0)))).toBe(24 * 60);
  });
  it('un turno de día no cambia', () => {
    const cin = atTime('2026-10-01', 9, 0);
    const cout = atTime('2026-10-01', 13, 30);
    expect(clockOutAfter(cin, cout)).toBe(cout);
  });
  it('el fin de mes y el cambio de horario (1 nov 2026) caen en el día siguiente correcto', () => {
    const cin = atTime('2026-10-31', 23, 0);
    const cout = clockOutAfter(cin, atTime('2026-10-31', 3, 0));
    expect([cout.getMonth(), cout.getDate(), cout.getHours()]).toEqual([10, 1, 3]);
  });
});
