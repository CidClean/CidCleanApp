import { estimateQuote, fromForm, previewQuote, toForm, validateEstimatorForm, type EstimatorSettings } from './estimator';

// Tarifas de D-309.
const D309: EstimatorSettings = {
  placeTypes: [
    { key: 'office', name: 'Office', rate: 0.04 },
    { key: 'medical', name: 'Medical / dental office', rate: 0.065 },
    { key: 'retail', name: 'Retail / showroom', rate: 0.045 },
    { key: 'warehouse', name: 'Warehouse', rate: 0.02 },
  ],
  frequencies: [
    { key: 'weekly_1', name: '1x per week', visitsPerMonth: 4.33, adjustment: 1 },
    { key: 'weekly_2', name: '2x per week', visitsPerMonth: 8.67, adjustment: 0.92 },
    { key: 'weekly_3', name: '3x per week', visitsPerMonth: 13, adjustment: 0.85 },
  ],
  minPerVisit: 85,
  rangePct: 0.15,
  roundTo: 10,
  walkthroughSqft: 25000,
};

describe('estimateQuote: ejemplos de D-309', () => {
  it.each([
    [3000, 0.04, 13, 0.85, 1130, 1520],
    [2000, 0.065, 13, 0.85, 1220, 1650],
    [1500, 0.045, 4.33, 1, 310, 420],
    [20000, 0.02, 8.67, 0.92, 2710, 3670],
  ])('%i sq ft × %f', (sqft, rate, visits, adj, low, high) => {
    const q = estimateQuote(sqft, rate, visits, adj, 85, 0.15, 10);
    expect([q.low, q.high]).toEqual([low, high]);
  });
  it('aplica el mínimo por visita', () => {
    expect(estimateQuote(1500, 0.045, 4.33, 1, 85, 0.15, 10).perVisit).toBe(85);
  });
});

describe('formulario', () => {
  it('ida y vuelta sin cambios', () => {
    expect(fromForm(toForm(D309), D309)).toEqual(D309);
    expect(toForm(D309).rangePercent).toBe('15');
  });
  it('vista previa: oficina 3,000 sq ft 3x por semana', () => {
    expect(previewQuote(toForm(D309), D309)).toMatchObject({ low: 1130, high: 1520, perVisit: 102 });
  });
  it('valida límites como la base', () => {
    const f = toForm(D309);
    const bad = { ...f, rates: { ...f.rates, office: '0' }, visits: { ...f.visits, weekly_3: '40' }, adjustments: { ...f.adjustments, weekly_1: 'x' },
      minPerVisit: '-5', rangePercent: '100', roundTo: '2.5', walkthroughSqft: '500' };
    expect(Object.keys(validateEstimatorForm(bad, D309)).sort()).toEqual(
      ['adjustment:weekly_1', 'minPerVisit', 'rangePercent', 'rate:office', 'roundTo', 'visits:weekly_3', 'walkthroughSqft'].sort(),
    );
    expect(previewQuote(bad, D309)).toBeNull();
    expect(validateEstimatorForm({ ...f, walkthroughSqft: '30,000' }, D309)).toEqual({});
  });
});
