import { fetchWeekVisits, formatTime, pickTodayVisit, startOfWeek, weekDays, type Visit } from './week';

const L_ES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const L_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const visit = (id: string, start: Date, end: Date): Visit => ({ id, siteName: 'Sitio', start, end });

describe('semana', () => {
  test('la semana empieza el domingo (D-231)', () => {
    expect(startOfWeek(at(2026, 10, 21, 15)).getDate()).toBe(18); // miércoles 21 oct 2026
    expect(startOfWeek(at(2026, 10, 25, 9)).getDate()).toBe(25); // domingo
    expect(startOfWeek(at(2026, 10, 24)).getDate()).toBe(18); // sábado
  });

  test('7 días con etiquetas en español e inglés y números de día', () => {
    const es = weekDays(at(2026, 10, 21), [], L_ES);
    expect(es.map((d) => d.label).join('')).toBe('DLMXJVS');
    expect(es.map((d) => d.dayNumber)).toEqual([18, 19, 20, 21, 22, 23, 24]);
    expect(weekDays(at(2026, 10, 21), [], L_EN).map((d) => d.label).join('')).toBe('SMTWTFS');
    expect(es.filter((d) => d.isToday)).toHaveLength(1);
    expect(es.some((d) => d.hasVisit)).toBe(false); // hoy no hay visitas
  });

  test('marca los días con visita y cruza el cambio de mes', () => {
    const v = [visit('a', at(2026, 10, 20, 18), at(2026, 10, 20, 21)), visit('b', at(2026, 11, 1, 9), at(2026, 11, 1, 10))];
    const days = weekDays(at(2026, 10, 28), v, L_ES); // semana del 25 oct al 31 oct
    expect(days.map((d) => d.dayNumber)).toEqual([25, 26, 27, 28, 29, 30, 31]);
    expect(days.map((d) => d.hasVisit)).toEqual([false, false, false, false, false, false, false]);
    const next = weekDays(at(2026, 11, 1), v, L_ES); // semana del 1 al 7 nov
    expect(next[0].hasVisit).toBe(true);
  });
});

describe('visita de hoy (D-165)', () => {
  const now = at(2026, 10, 21, 12, 0);
  test('sin visitas hoy no hay tarjeta', async () => {
    expect(pickTodayVisit([], now)).toBeNull();
    expect(pickTodayVisit([visit('x', at(2026, 10, 22, 18), at(2026, 10, 22, 21))], now)).toBeNull();
    expect(await fetchWeekVisits(at(2026, 10, 19))).toEqual([]); // fuente vacía hasta la etapa 4
  });
  test('con varias hoy, la próxima que no ha terminado', () => {
    const early = visit('early', at(2026, 10, 21, 7), at(2026, 10, 21, 9)); // ya terminó
    const evening = visit('evening', at(2026, 10, 21, 18), at(2026, 10, 21, 21));
    const night = visit('night', at(2026, 10, 21, 22), at(2026, 10, 21, 23, 30));
    expect(pickTodayVisit([night, evening, early], now)?.id).toBe('evening');
    expect(pickTodayVisit([early], now)).toBeNull();
  });
});

describe('hora', () => {
  test('formato 12 horas como en la muestra', () => {
    expect(formatTime(at(2026, 10, 21, 18, 0))).toBe('6:00 PM');
    expect(formatTime(at(2026, 10, 21, 21, 30))).toBe('9:30 PM');
    expect(formatTime(at(2026, 10, 21, 7, 5))).toBe('7:05 AM');
  });
});
