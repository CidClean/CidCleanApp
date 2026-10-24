import { dayKey } from './leadRules';
import {
  cityFrom,
  emptyJobsiteForm,
  emptyPayForm,
  frequencyLabel,
  groupByClient,
  jobsiteData,
  payMonthlyCost,
  prorateFixed,
  statusChangeNeedsConfirm,
  statusOptions,
  validateJobsite,
  startDateError,
  validatePay,
  visitsPerMonth,
  type Jobsite,
} from './clientRules';
import { formatUsDate } from './leadRules';
import { formatCoordinates, isValidPlusCode, plusCodeToCoordinates } from './plusCode';

const today = new Date(2026, 9, 23);
const js = (over: Partial<Jobsite>): Jobsite => ({
  id: 'j', clientId: 'c', clientName: 'C', clientLegacy: false, name: 'J', address: '', plusCode: null, contactName: null,
  contactPhone: null, contactEmail: null, emergencyName: null, emergencyPhone: null, emergencyRelation: null, emergencyEmail: null,
  frequency: null, estHoursPerVisit: null, visitsPerMonth: null, startDate: null, status: 'active', walkthroughVersion: null, ...over,
});

describe('Cuentas agrupadas por cliente (D-082)', () => {
  it('orden alfabético; Terminados al final; clientes sin jobsites también salen', () => {
    const g = groupByClient(
      [js({ id: '1', clientId: 'b', clientName: 'Beta', name: 'Z' }), js({ id: '2', clientId: 'b', clientName: 'Beta', name: 'A', status: 'terminated' }), js({ id: '3', clientId: 'a', clientName: 'Alfa', name: 'M' })],
      [{ id: 'x', name: 'Cero', legacy: true, phone: null, email: null, address: null, notes: null }],
    );
    expect(g.map((x) => x.clientName)).toEqual(['Alfa', 'Beta', 'Cero']);
    expect(g[1].jobsites.map((j) => j.name)).toEqual(['Z', 'A']);
    expect(g[2].jobsites).toHaveLength(0);
  });
});

describe('Estado del jobsite (D-056, D-210)', () => {
  it('pausar y terminar piden confirmación; un terminado no cambia', () => {
    expect(statusChangeNeedsConfirm('active', 'paused')).toBe(true);
    expect(statusChangeNeedsConfirm('active', 'terminated')).toBe(true);
    expect(statusChangeNeedsConfirm('paused', 'active')).toBe(false);
    expect(statusOptions('terminated')).toEqual(['terminated']);
  });
});

describe('Pago por jobsite (D-059, D-061, D-096, D-100, D-210)', () => {
  const base = emptyPayForm(today, formatUsDate);
  it('mínimo de $15.00 solo para W-2 por hora', () => {
    expect(validatePay({ ...base, hourlyRate: '14.99' }, 'w2', today)).toEqual({ hourlyRate: 'minWage' });
    expect(validatePay({ ...base, hourlyRate: '14.99' }, '1099', today)).toEqual({});
    expect(validatePay({ ...base, hourlyRate: '15' }, 'w2', today)).toEqual({});
    expect(validatePay({ ...base, kind: 'fixed', fixedAmount: '10' }, 'w2', today)).toEqual({});
  });
  it('sin efecto retroactivo: la fecha de inicio no puede ser pasada', () => {
    expect(validatePay({ ...base, hourlyRate: '18', from: '10/22/2026' }, 'w2', today)).toEqual({ from: 'past' });
  });
  it('D-241: en un jobsite de cliente previo el pago puede empezar en una fecha pasada', () => {
    expect(validatePay({ ...base, hourlyRate: '20', from: '09/17/2026' }, 'w2', today, true)).toEqual({});
    expect(validatePay({ ...base, hourlyRate: '20', from: '09/17/2026' }, 'w2', today, false)).toEqual({ from: 'past' });
    expect(validatePay({ ...base, hourlyRate: '14', from: '09/17/2026' }, 'w2', today, true)).toEqual({ hourlyRate: 'minWage' });
  });
});

describe('Fechas de inicio (D-210, D-241)', () => {
  it('pasada solo en jobsites de clientes previos; hoy y futuro siempre', () => {
    const hoy = dayKey(today);
    expect(startDateError('2026-09-17', new Date(2026, 9, 24), true)).toBeNull();
    expect(startDateError('2026-09-17', new Date(2026, 9, 24), false)).toBe('past');
    expect(startDateError(hoy, today, false)).toBeNull();
    expect(startDateError('2099-01-01', today, false)).toBeNull();
    expect(startDateError(null, today, true)).toBe('invalid');
    expect(startDateError('invalid', today, true)).toBe('invalid');
  });
  it('costo mensual: horas garantizadas, tarifa fija por visita, semana o mes', () => {
    expect(payMonthlyCost({ kind: 'hourly', hourlyRate: 18, guaranteedHours: 3, fixedAmount: null, fixedPeriod: null }, 2.2, 10)).toBe(540);
    expect(payMonthlyCost({ kind: 'fixed', hourlyRate: null, guaranteedHours: null, fixedAmount: 120, fixedPeriod: 'visit' }, null, 10)).toBe(1200);
    expect(payMonthlyCost({ kind: 'fixed', hourlyRate: null, guaranteedHours: null, fixedAmount: 300, fixedPeriod: 'week' }, null, null)).toBe(1300);
    expect(visitsPerMonth({ kind: 'weekly', days: [0, 2, 4] }, null)).toBe(13);
  });
  it('tarifa fija a mitad de mes se prorratea por días', () => {
    expect(prorateFixed(3000, 'month', '2026-11-01', '2026-11-16', null)).toBe(1500);
  });
});

describe('Jobsite: Plus Code, contactos y fechas (D-210, D-211, D-216)', () => {
  it('Plus Code corto con la localidad se convierte cerca de Naples', () => {
    const c = plusCodeToCoordinates('66G8+4P Naples, Florida');
    expect(c).not.toBeNull();
    expect(Math.abs((c?.latitude ?? 0) - 26.13)).toBeLessThan(0.2);
    expect(formatCoordinates(c!)).toMatch(/^26\.\d{5}, -81\.\d{5}$/);
    expect(isValidPlusCode('nada')).toBe(false);
  });
  it('teléfonos de 10 dígitos y se guardan formateados', () => {
    const f = { ...emptyJobsiteForm, name: 'Sede', address: '1 Main St, Naples, FL 34102' };
    expect(validateJobsite({ ...f, contactPhone: '239555', emergencyPhone: '(239) 555-0142' }, { withRate: false, plusCodeOk: isValidPlusCode })).toEqual({ contactPhone: true });
    const d = jobsiteData({ ...f, contactPhone: '2395550142', emergencyName: 'Ana', emergencyRelation: 'Gerente', emergencyPhone: '239.555.0100', startDate: '11/01/2026' });
    expect(d.contact_phone).toBe('(239) 555-0142');
    expect(d.emergency_phone).toBe('(239) 555-0100');
    expect(d.start_date).toBe('2026-11-01');
  });
  it('ciudad del encabezado y frecuencia en una línea', () => {
    expect(cityFrom('123 5th Ave S, Naples, FL 34102')).toBe('Naples, FL');
    expect(frequencyLabel({ kind: 'weekly', days: [4, 0, 2] }, { daily: 'Diaria', other: 'Otra', days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], and: 'y' })).toBe('Lun, Mié y Vie');
  });
});
