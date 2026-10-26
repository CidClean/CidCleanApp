import { statisticsEs } from '@/i18n/statistics';
import {
  absenceDay,
  absenceTarget,
  costShare,
  homeCards,
  hours,
  missing,
  pct,
  perHour,
  punctualityPct,
  statsCsv,
  statsFileName,
  toAdminHome,
  toReport,
  trendScale,
  usedPct,
} from './statisticsRules';
import type { Access } from './visibility';

const access = (perms: string[], sa = false): Access => ({ isSuperAdmin: sa, permissions: new Set(perms) });

describe('derivados de Estadísticas (D-253)', () => {
  test('horas como en Accounting, con "h"', () => {
    expect(hours(12186)).toBe('203.1 h');
    expect(hours(12240)).toBe('204 h');
    expect(hours(238.9)).toBe('3.98 h');
  });
  test('% aprovechado = trabajadas / pagadas; sin pagadas, null', () => {
    expect(pct(usedPct({ workedMinutes: 690, paidMinutes: 720 })!)).toBe('95.8');
    expect(usedPct({ workedMinutes: 0, paidMinutes: 0 })).toBeNull();
  });
  test('por hora trabajada; sin horas, null', () => {
    expect(perHour(7020, 12186)).toBe(34.56);
    expect(perHour(100, 0)).toBeNull();
  });
  test('puntualidad solo con entradas propias (a tiempo = hasta 5 min, lo calcula la base)', () => {
    expect(punctualityPct({ punctualSelf: 4, punctualOnTime: 3 })).toBe(75);
    expect(punctualityPct({ punctualSelf: 0, punctualOnTime: 0 })).toBeNull();
  });
  test('faltas = programados − trabajados, nunca negativo', () => {
    expect(missing({ scheduled: 53, scheduledWorked: 51 })).toBe(2);
    expect(missing({ scheduled: 1, scheduledWorked: 2 })).toBe(0);
  });
  test('día de la falta en español e inglés', () => {
    const es = require('@/i18n/sales').salesEs;
    expect(absenceDay('2026-10-25', es.dayNames, es.monthShort, 'es')).toBe('dom 25 oct');
    expect(absenceDay('2026-10-25', ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 'en')).toBe('Sun Oct 25');
  });
  test('escala de la tendencia: el mayor valor (mínimo 1)', () => {
    expect(trendScale([{ month: 'x', expected: 7020, staff: 4080, expenses: 0, profit: 2940 }])).toBe(7020);
    expect(trendScale([])).toBe(1);
  });
});

describe('lectura de la base', () => {
  test('toReport con valores nulos y listas vacías', () => {
    const r = toReport({ accounts: [{ jobsite_id: 'j', name: 'A', client: 'C', margin: null, est_minutes: null, avg_minutes: null }] });
    expect(r.accounts[0]).toMatchObject({ jobsiteId: 'j', margin: null, estMinutes: null, avgMinutes: null, workedMinutes: 0, absences: [], employees: [] });
    expect(r.employees).toEqual([]);
    expect(r.trend).toEqual([]);
  });
  test('toAdminHome: lo que llega null queda null (sin permiso)', () => {
    const h = toAdminHome({ month: null, receivable: null, to_approve: { visits: 1, shifts: 2, urgent: 0 }, today: null, week_hours: null, pipeline: null, accounts: { active: 2, at_risk: null } });
    expect(h.month).toBeNull();
    expect(h.weekHours).toBeNull();
    expect(h.toApprove).toEqual({ visits: 1, shifts: 2, urgent: 0 });
    expect(h.accounts).toEqual({ active: 2, atRisk: null });
  });
  test('barra de la tarjeta de marca: lo que se va en personal y gastos', () => {
    expect(Math.round(costShare({ expected: 7020, staff: 4080, expenses: 0 }) * 100)).toBe(58);
    expect(costShare({ expected: 0, staff: 0, expenses: 0 })).toBe(0);
    expect(costShare({ expected: 100, staff: 200, expenses: 0 })).toBe(1);
  });
});

describe('quién ve qué (D-253, D-223)', () => {
  test('cada tarjeta del Inicio con su permiso; horas contra 32 h solo con el schedule', () => {
    expect(homeCards(access([], true))).toEqual({ profit: true, receivable: true, toApprove: true, today: true, weekHours: true, pipeline: true, accounts: true });
    const staff = homeCards(access([]));
    expect(Object.values(staff).every((v) => v === false)).toBe(true);
    expect(homeCards(access(['work_registrar_por_otros']))).toMatchObject({ today: true, weekHours: false });
    expect(homeCards(access(['ingresos_ver_registrar']))).toMatchObject({ receivable: false });
    expect(homeCards(access(['ingresos_ver_registrar', 'clientes_ver_tarifa']))).toMatchObject({ receivable: true, profit: false });
  });
  test('la falta abre la visita con el schedule, el trabajo con permisos de Work, o nada', () => {
    expect(absenceTarget(access(['schedule_ver_editar']))).toBe('visit');
    expect(absenceTarget(access(['work_aprobar']))).toBe('work');
    expect(absenceTarget(access(['estadisticas_ver']))).toBeNull();
  });
});

describe('exportar (D-253)', () => {
  const r = toReport({
    accounts: [{ jobsite_id: 'j', name: 'Sede, Norte', client: 'C', visits: 2, shifts: 3, worked_minutes: 690, paid_minutes: 720, unworked_minutes: 30,
      unworked_amount: 10, expected: 1000, staff: 240, expenses: 0, profit: 760, margin: 76, avg_minutes: 230, est_minutes: 240, punctual_self: 2,
      punctual_on_time: 1, scheduled: 4, scheduled_worked: 3 }],
    employees: [{ profile_id: 'p', name: 'Ana', worker_type: '1099', cost: 80, scheduled: 2, scheduled_worked: 1, worked_minutes: 240, paid_minutes: 240 }],
    trend: [{ month: '2026-09-01', expected: 1000, staff: 240, expenses: 0, profit: 760 }],
  });
  test('CSV de Cuentas con comillas donde hace falta y cifras con dos decimales', () => {
    const csv = statsCsv('accounts', r, statisticsEs);
    expect(csv.split('\r\n')[1]).toBe('"Sede, Norte",C,2,3,11.50,12.00,0.50,10.00,95.8,1000.00,240.00,0.00,760.00,76.0,86.96,20.87,3.83,4.00,2,1,4,3,1');
  });
  test('CSV de Empleados y de Tendencia', () => {
    expect(statsCsv('employees', r, statisticsEs).split('\r\n')[1]).toBe('Ana,1099,2,1,1,4.00,4.00,0.00,0.00,80.00,0,0');
    expect(statsCsv('trend', r, statisticsEs).split('\r\n')[1]).toBe('2026-09,1000.00,240.00,0.00,760.00');
  });
  test('nombre del archivo por pestaña y periodo', () => {
    expect(statsFileName('employees', { from: '2026-09', to: '2026-10' })).toBe('cidclean-estadisticas-employees-2026-09_2026-10.csv');
  });
});
