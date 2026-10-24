import { accountingEn, accountingEs } from '@/i18n/accounting';

import {
  accountingAccess,
  canExport,
  dashboardHtml,
  groupStaff,
  hoursText,
  money,
  monthTitle,
  normalizePeriod,
  parseMoney,
  periodFromParams,
  periodTitle,
  progress,
  recurringLine,
  reportCsv,
  reportFileName,
  shiftMonth,
  shiftPeriod,
  toCsv,
} from './accountingRules';
import { safeLink } from './notificationsApi';

jest.mock('./supabase', () => ({ supabase: {} }));

const access = (...keys: string[]) => ({ isSuperAdmin: false, permissions: new Set(keys) });

describe('periodos (D-069, D-215)', () => {
  test('mes con flechas y rango', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod({ from: '2026-10', to: '2026-10' }, 1)).toEqual({ from: '2026-11', to: '2026-11' });
    // Un rango de 3 meses se mueve de 3 en 3.
    expect(shiftPeriod({ from: '2026-10', to: '2026-12' }, -1)).toEqual({ from: '2026-07', to: '2026-09' });
  });
  test('un rango al revés se ordena y no pasa de 5 años', () => {
    expect(normalizePeriod({ from: '2026-12', to: '2026-10' })).toEqual({ from: '2026-10', to: '2026-12' });
    expect(normalizePeriod({ from: '2020-01', to: '2030-01' }).to).toBe('2024-12');
  });
  test('de la ruta; sin nada, el mes actual', () => {
    expect(periodFromParams('2026-10', '2026-12')).toEqual({ from: '2026-10', to: '2026-12' });
    expect(periodFromParams(undefined, undefined, new Date(2026, 9, 24))).toEqual({ from: '2026-10', to: '2026-10' });
    expect(periodFromParams('nada', '2026-13', new Date(2026, 9, 24))).toEqual({ from: '2026-10', to: '2026-10' });
  });
  test('títulos como la muestra de la ronda 7', () => {
    expect(monthTitle('2026-10', accountingEs)).toBe('Octubre 2026');
    expect(accountingEs.incomeTitle(monthTitle('2026-10', accountingEs))).toBe('Ingresos · octubre 2026');
    expect(accountingEn.incomeTitle(monthTitle('2026-10', accountingEn))).toBe('Income · October 2026');
    expect(periodTitle({ from: '2026-10', to: '2026-12' }, accountingEs)).toBe('Octubre 2026 – Diciembre 2026');
  });
});

describe('formatos', () => {
  test('montos con $ y dos decimales; horas en horas (D-231)', () => {
    expect(money(5450)).toBe('$5,450.00');
    expect(money(-12.5)).toBe('−$12.50');
    expect(money(null)).toBe('$0.00');
    expect(hoursText(2550)).toBe('42.5');
    expect(hoursText(180)).toBe('3');
    expect(hoursText(75)).toBe('1.25');
  });
  test('monto escrito', () => {
    expect(parseMoney('1,200.50')).toBe(1200.5);
    expect(parseMoney('$80')).toBe(80);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('1.234')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
  });
  test('barra de avance de lo recibido (D-063)', () => {
    expect(progress(1850, 5450)).toBeCloseTo(0.339, 2);
    expect(progress(10, 0)).toBe(0);
    expect(progress(20, 10)).toBe(1);
  });
  test('frecuencia del recurrente', () => {
    expect(recurringLine({ frequency: 'monthly', day: 1, month: null }, accountingEs)).toBe('Cada mes · Día 1');
    expect(recurringLine({ frequency: 'yearly', day: 15, month: 3 }, accountingEs)).toBe('Cada año · 15 de marzo');
  });
});

describe('permisos de pantalla (current/permisos.md)', () => {
  test('ver ingresos por cuenta exige también ver tarifa', () => {
    expect(accountingAccess(access('ingresos_ver_registrar')).income).toBe(false);
    expect(accountingAccess(access('ingresos_ver_registrar', 'clientes_ver_tarifa')).income).toBe(true);
    expect(accountingAccess(access('ingresos_ver_registrar', 'clientes_ver_tarifa')).markReceived).toBe(false);
    expect(accountingAccess(access('ingresos_ver_registrar', 'clientes_ver_tarifa', 'ingresos_marcar_recibidos')).markReceived).toBe(true);
  });
  test('dashboard por cuenta con ver tarifa; global aparte', () => {
    expect(accountingAccess(access('dashboard_cuenta')).account).toBe(false);
    expect(accountingAccess(access('dashboard_cuenta', 'clientes_ver_tarifa')).account).toBe(true);
    expect(accountingAccess(access('dashboard_cuenta', 'clientes_ver_tarifa')).global).toBe(false);
  });
  test('cada exporte con su permiso', () => {
    const a = accountingAccess(access('reportes_exportar', 'personal_ver_costo'));
    expect(canExport(a, 'staff')).toBe(true);
    expect(canExport(a, 'profit')).toBe(false);
    expect(canExport(a, 'income')).toBe(false);
    expect(canExport(accountingAccess(access('personal_ver_costo')), 'staff')).toBe(false);
    expect(accountingAccess({ isSuperAdmin: true, permissions: new Set() }).export).toBe(true);
  });
});

describe('exportes (D-215)', () => {
  test('CSV con comillas cuando hace falta', () => {
    expect(toCsv(['a', 'b'], [['x, y', 'dijo "hola"'], [1, null]])).toBe('a,b\r\n"x, y","dijo ""hola"""\r\n1,\r\n');
  });
  test('profit por mes', () => {
    const csv = reportCsv('profit', [{ month: '2026-10-01', expected: 1150, received: 1100, pending: 50, staff: 635.29, expenses: 120, profit: 394.71 }], accountingEs, 'es');
    expect(csv).toBe('Mes,Esperado,Recibido,Pendiente,Personal,Gastos,Profit\r\n2026-10,1150.00,1100.00,50.00,635.29,120.00,394.71\r\n');
  });
  test('costo de personal por empleado, con tipo y horas', () => {
    const csv = reportCsv('staff', [{ month: '2026-10-01', employee: 'Ana R.', worker_type: 'w2', jobsite: 'Sede A', hours: 3, amount: 54 }], accountingEn, 'en');
    expect(csv).toBe('Month,Employee,Type,Jobsite,Hours,Amount\r\n2026-10,Ana R.,W-2,Sede A,3,54.00\r\n');
  });
  test('gastos por categoría en el idioma de quien exporta', () => {
    const rows = [{ month: '2026-10-01', category_es: 'Seguro', category_en: 'Insurance', amount: 200 }];
    expect(reportCsv('expenses', rows, accountingEs, 'es')).toContain('2026-10,Seguro,200.00');
    expect(reportCsv('expenses', rows, accountingEn, 'en')).toContain('2026-10,Insurance,200.00');
  });
  test('ingresos recibidos y pendientes', () => {
    const csv = reportCsv(
      'income',
      [{ month: '2026-10-01', client: 'Cliente', jobsite: 'Sede', expected: 1150, received: 1100, pending: 50, received_on: '2026-10-20', adjust_note: 'Extra, hablado' }],
      accountingEs,
      'es',
    );
    expect(csv).toContain('2026-10,Cliente,Sede,1150.00,1100.00,50.00,2026-10-20,"Extra, hablado"');
  });
  test('nombre del archivo', () => {
    expect(reportFileName('staff', { from: '2026-10', to: '2026-10' })).toBe('cidclean-staff-2026-10.csv');
    expect(reportFileName('profit', { from: '2026-10', to: '2026-12' })).toBe('cidclean-profit-2026-10_2026-12.csv');
  });
  test('PDF del dashboard: las cuatro cifras, Recibido / Pendiente y la tabla por mes', () => {
    const html = dashboardHtml(
      {
        expected: 1150,
        received: 1100,
        pending: 50,
        staff: 635.29,
        expenses: 120,
        profit: 394.71,
        months: [{ month: '2026-10-01', expected: 1150, received: 1100, pending: 50, staff: 635.29, expenses: 120, profit: 394.71 }],
        atRisk: [],
      },
      { from: '2026-10', to: '2026-10' },
      'Global',
      accountingEs,
    );
    expect(html).toContain('$394.71');
    expect(html).toContain('Recibido $1,100.00 · Pendiente $50.00');
    expect(html).toContain('<td>Octubre 2026</td>');
    expect(html).toContain('#0F766E');
  });
});

describe('Personal por empleado o por jobsite (D-067)', () => {
  const rows = [
    { profileId: 'p1', name: 'Ana', workerType: 'w2', minutes: 240, amount: 100, jobsites: [{ jobsiteId: 'j1', jobsite: 'Sede A', month: '2026-10-01', minutes: 180, amount: 54 }, { jobsiteId: 'j2', jobsite: 'Sede B', month: '2026-10-01', minutes: 60, amount: 46 }] },
    { profileId: 'p2', name: 'Beto', workerType: '1099', minutes: 60, amount: 40, jobsites: [{ jobsiteId: 'j1', jobsite: 'Sede A', month: '2026-10-01', minutes: 60, amount: 40 }] },
  ];
  test('por empleado con el detalle por jobsite', () => {
    const g = groupStaff(rows, 'employee', () => null);
    expect(g.map((x) => [x.name, x.amount, x.detail.length])).toEqual([['Ana', 100, 2], ['Beto', 40, 1]]);
  });
  test('por jobsite suma a cada empleado', () => {
    const g = groupStaff(rows, 'jobsite', () => null);
    expect(g.map((x) => [x.name, x.amount, x.minutes])).toEqual([['Sede A', 94, 240], ['Sede B', 46, 60]]);
    expect(g[0].detail.map((d) => d.name)).toEqual(['Ana', 'Beto']);
  });
  test('con rango, el mes en cada detalle', () => {
    expect(groupStaff(rows, 'employee', (m) => (m === '2026-10-01' ? 'Oct' : null))[0].detail[0].name).toBe('Sede A · Oct');
  });
});

describe('aviso: pantalla que abre (D-118)', () => {
  test('solo rutas conocidas y parámetros de texto', () => {
    expect(safeLink({ pathname: '/jobsites/[id]', params: { id: 'j1', x: 3 } })).toEqual({ pathname: '/jobsites/[id]', params: { id: 'j1' } });
    expect(safeLink({ pathname: 'https://otro.sitio' })).toBeNull();
    expect(safeLink(null)).toBeNull();
  });
});
