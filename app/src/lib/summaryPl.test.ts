import { accountingEs } from '@/i18n/accounting';
import { summaryPlEn, summaryPlEs } from '@/i18n/summaryPl';

import {
  accountLine,
  lineLabel,
  parseEmployeeSummary,
  parseProfitAndLoss,
  plCsv,
  plHtml,
  plSummaryRows,
  SCHEDULE_C_LINES,
  summaryCsv,
  summaryHtml,
  summaryMonths,
  workLabel,
} from './summaryPl';

jest.mock('./scheduleApi', () => ({ rpc: jest.fn() }));

const estela = parseEmployeeSummary({
  name: 'Estela Medina', worker_type: '1099', year: 2026,
  accounts: [
    { jobsite_id: 'a', jobsite: 'Naples Yacht Club', client: 'Wilson Franquicia', start_date: '2026-09-17', end_date: null, current: true },
    { jobsite_id: 'b', jobsite: 'Clinica Quirúrgica', client: 'Wilson Franquicia', start_date: '2026-08-01', end_date: '2026-08-31', current: false },
  ],
  months: [
    { month: '2026-10-01', days: 8, minutes: 0, amount: '640.00' },
    { month: '2026-08-01', days: 15, minutes: 0, amount: 1350 },
  ],
  days: 23, minutes: 0, amount: '1990.00',
});

describe('resumen del empleado (D-294)', () => {
  test('meses de la primera a la última con trabajo, los de en medio en cero', () => {
    expect(summaryMonths(estela).map((m) => `${m.month}:${m.days}:${m.amount}`)).toEqual(['2026-08:15:1350', '2026-09:0:0', '2026-10:8:640']);
  });
  test('cuentas: vigente con "desde" y terminada con fechas', () => {
    expect(accountLine(estela.accounts[0], accountingEs, summaryPlEs)).toBe('Wilson Franquicia · desde Sep 17, 2026');
    expect(accountLine(estela.accounts[1], accountingEs, summaryPlEs)).toBe('Wilson Franquicia · Ago 1 – Ago 31, 2026');
  });
  test('días para el 1099 y horas para el W-2', () => {
    expect(workLabel(estela, estela, summaryPlEs)).toBe('23 días');
    expect(workLabel({ ...estela, workerType: 'w2' }, { days: 0, minutes: 90 }, summaryPlEn)).toBe('1.5 h');
  });
  test('CSV y PDF con el total del año', () => {
    const csv = summaryCsv(estela, summaryPlEs);
    expect(csv).toContain('Total 2026,23,0,1990.00');
    expect(csv).toContain('Clinica Quirúrgica,Wilson Franquicia,2026-08-01,2026-08-31,Terminada');
    const html = summaryHtml(estela, summaryPlEs, accountingEs, new Date(2026, 9, 31));
    expect(html).toContain('Resumen del empleado · Estela Medina');
    expect(html).toContain('<tr class="t"><td>Total 2026</td><td class="n">23</td><td class="n">$1,990.00</td></tr>');
    expect(html).not.toContain('#FBF6EF');
  });
});

const pl = parseProfitAndLoss({
  year: 2026, income: '24456.00', contract_labor: 13870, wages: 0, expenses_total: 1673.9, net: '8912.10',
  expenses: [
    { category_id: '1', label_es: 'Suministros', label_en: 'Supplies', line: '22', amount: 412.3 },
    { category_id: '3', label_es: 'Seguro', label_en: 'Insurance', line: '15', amount: 811.6 },
    { category_id: '6', label_es: 'Otro', label_en: 'Other', line: '27a', amount: 450 },
  ],
  schedule_c: [
    { line: '1', name: 'Gross receipts', amount: 24456 },
    { line: '11', name: 'Contract labor', amount: 13870 },
    { line: '15', name: 'Insurance', amount: 811.6 },
    { line: '22', name: 'Supplies', amount: 412.3 },
    { line: '27a', name: 'Other expenses', amount: 450 },
    { line: '31', name: 'Net profit', amount: 8912.1 },
  ],
});

describe('Profit & Loss (D-295)', () => {
  test('vista Resumen: personal 1099, W-2 y cada categoría', () => {
    expect(plSummaryRows(pl, summaryPlEs, 'es').map((r) => r.label)).toEqual([
      'Personal 1099 (Contract labor)', 'Personal W-2 (Wages)', 'Suministros', 'Seguro', 'Otro',
    ]);
  });
  test('líneas del Schedule C del selector', () => {
    expect(SCHEDULE_C_LINES.map((l) => l.line)).toEqual(['8', '9', '10', '11', '13', '14', '15', '16a', '16b', '17', '18', '20a', '20b', '21', '22', '23', '24a', '24b', '25', '26', '27a']);
    expect(lineLabel('22')).toBe('22 · Supplies');
  });
  test('PDF como la muestra: Cash basis, línea 31 en la fila de total', () => {
    const html = plHtml(pl, 'schedule_c', summaryPlEs, 'es', new Date(2026, 9, 31));
    expect(html).toContain('January 1 – December 31, 2026 · Cash basis');
    expect(html).toContain('<td>11</td><td>Contract labor</td><td class="n">13,870.00</td>');
    expect(html).toContain('<tr class="t"><td>31</td><td>Net profit</td><td class="n">8,912.10</td></tr>');
    expect(html).toContain('Generated Oct 31, 2026 · Cid Clean LLC');
    expect(plHtml(pl, 'summary', summaryPlEs, 'es')).toContain('Ganancia neta');
  });
  test('CSV de las dos vistas', () => {
    expect(plCsv(pl, 'schedule_c', summaryPlEs, 'es')).toContain('31,Net profit,8912.10');
    const csv = plCsv(pl, 'summary', summaryPlEs, 'es');
    expect(csv).toContain('Ingresos,24456.00');
    expect(csv).toContain('Ganancia neta,8912.10');
  });
});
