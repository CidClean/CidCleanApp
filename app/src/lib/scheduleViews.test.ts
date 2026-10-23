import type { ScheduleVisit } from './scheduleApi';
import { abbreviate, dayRows, employeeRows, firstHour, hourLabel, placeDay, scheduleHtml, shiftAnchor, viewDays } from './scheduleViews';

const v = (id: string, day: string, h: number, minutes: number, staff: string[], jobsite = 'Break TAX Office'): ScheduleVisit => {
  const [y, m, d] = day.split('-').map(Number);
  return {
    id,
    jobsiteId: 'j',
    jobsite,
    client: 'C',
    day,
    startsAt: new Date(y, m - 1, d, h, 0),
    minutes,
    generated: true,
    approved: false,
    worked: false,
    staff: staff.map((n) => ({ id: n.toLowerCase(), name: n })),
  };
};

describe('vistas del Schedule (D-231)', () => {
  const anchor = new Date(2026, 9, 23); // viernes
  it('la semana va de domingo a sábado; 3 días con el día al centro; mes en semanas completas', () => {
    expect(viewDays('table', 'week', anchor)).toEqual(['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']);
    expect(viewDays('calendar', 'day', anchor)).toEqual(['2026-10-23']);
    expect(viewDays('calendar', 'three', anchor)).toEqual(['2026-10-22', '2026-10-23', '2026-10-24']);
    const month = viewDays('calendar', 'month', anchor);
    expect(month[0]).toBe('2026-09-27');
    expect(month).toHaveLength(35);
    expect(month[month.length - 1]).toBe('2026-10-31');
  });

  it('las flechas mueven una semana, un día, 3 días o un mes', () => {
    expect(shiftAnchor('list', 'day', anchor, 1).getDate()).toBe(30);
    expect(shiftAnchor('calendar', 'day', anchor, -1).getDate()).toBe(22);
    expect(shiftAnchor('calendar', 'three', anchor, 1).getDate()).toBe(26);
    const m = shiftAnchor('calendar', 'month', anchor, 1);
    expect([m.getMonth(), m.getDate()]).toEqual([10, 1]);
  });

  it('Empleado → días: fila por persona y fila de visitas sin personal; celdas vacías si no trabaja', () => {
    const days = viewDays('table', 'week', anchor);
    const rows = employeeRows([v('a', '2026-10-19', 18, 120, ['Rosemary', 'Diego']), v('b', '2026-10-21', 9, 90, [])], days, 'Sin personal');
    expect(rows.map((r) => r.name)).toEqual(['Diego', 'Rosemary', 'Sin personal']);
    expect(rows[1].cells.map((c) => c.length)).toEqual([0, 1, 0, 0, 0, 0, 0]);
    expect(rows[2].cells[3].map((x) => x.id)).toEqual(['b']);
  });

  it('Día → empleados: una ficha por persona y visita', () => {
    const days = viewDays('table', 'week', anchor);
    const rows = dayRows([v('a', '2026-10-19', 18, 120, ['Rosemary', 'Diego']), v('b', '2026-10-19', 9, 90, [])], days);
    expect(rows).toHaveLength(7);
    expect(rows[1].chips.map((c) => c.person)).toEqual([null, 'Rosemary', 'Diego']);
  });

  it('calendario: visitas que se cruzan van en carriles', () => {
    const p = placeDay([v('a', '2026-10-19', 9, 120, []), v('b', '2026-10-19', 10, 60, []), v('c', '2026-10-19', 14, 60, [])]);
    expect(p.map((x) => [x.visit.id, x.lane, x.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ]);
    expect(firstHour([v('a', '2026-10-19', 9, 60, [])])).toBe(8);
    expect(firstHour([])).toBe(7);
    expect(hourLabel(0)).toBe('12 AM');
    expect(hourLabel(13)).toBe('1 PM');
  });

  it('abrevia el jobsite y arma el PDF en el estilo C1 sin dejar pasar HTML', () => {
    expect(abbreviate('Naples Yacht Club')).toBe('Naples Yach…');
    expect(abbreviate('Break TAX')).toBe('Break TAX');
    const days = viewDays('table', 'week', anchor);
    const html = scheduleHtml('employee', [v('a', '2026-10-19', 18, 90, ['<b>Rosemary</b>'])], days, {
      title: 'Horario semanal',
      range: '18 oct – 24 oct',
      employee: 'Empleado',
      unstaffed: 'Sin personal',
      noVisits: 'Sin visitas.',
      dayHeaders: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
      dayTitle: (k) => k,
      hours: { h: 'h' },
    });
    expect(html).toContain('#FBF6EF');
    expect(html).toContain('landscape');
    expect(html).toContain('&lt;b&gt;Rosemary&lt;/b&gt;');
    expect(html).toContain('1.5 h');
    expect(html.indexOf('>D<')).toBeLessThan(html.indexOf('>L<'));
  });
});
