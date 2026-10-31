import type { Locale } from './index';

/**
 * Textos del resumen del empleado (orden 71, D-294) y del Profit & Loss (orden 72, D-295).
 * APROBADO = de `surveys/resumen-pl-pdf-aprobado.html` o de la decisión citada; D-200 = detalle menor.
 */
export const summaryPlEs = {
  // Resumen del empleado (D-294)
  tabSummary: 'Resumen', // APROBADO (D-294)
  previousYear: 'Año anterior', // D-200
  nextYear: 'Año siguiente', // D-200
  serviceDays: 'Días de servicio', // APROBADO (D-294)
  hours: 'Horas', // APROBADO (D-294: horas si es W-2)
  paid: 'Pagado', // APROBADO (D-294)
  accounts: 'Cuentas', // APROBADO (D-294)
  noAccounts: 'Sin cuentas.', // D-200
  current: 'Vigente', // APROBADO (D-294)
  ended: 'Terminada', // APROBADO (D-294)
  since: (d: string) => `desde ${d}`, // APROBADO (D-294)
  byMonth: 'Por mes', // APROBADO (D-294)
  noMonths: 'Sin trabajo aprobado este año.', // D-200
  days: (n: number) => (n === 1 ? '1 día' : `${n} días`), // APROBADO (D-294)
  total: (y: number) => `Total ${y}`, // APROBADO (D-294)
  exportButton: 'Exportar (PDF / CSV)', // APROBADO (D-294)
  summaryTitle: 'Resumen del empleado', // D-200 (título del PDF)
  summaryHeader: ['Mes', 'Días', 'Horas', 'Monto'], // D-200
  accountsHeader: ['Cuenta', 'Cliente', 'Desde', 'Hasta', 'Estado'], // D-200
  errorLoad: 'No se pudo cargar el resumen. Revisa tu conexión e inténtalo de nuevo.', // D-200

  // Profit & Loss (D-295)
  plTitle: 'Profit & Loss', // APROBADO (D-295)
  plLine: 'Ingresos, personal y gastos del año', // D-200 (fila en Accounting)
  viewSummary: 'Resumen', // APROBADO (D-295)
  viewScheduleC: 'Schedule C', // APROBADO (D-295)
  income: 'Ingresos', // APROBADO (D-295)
  contractLabor: 'Personal 1099 (Contract labor)', // APROBADO (D-295)
  wages: 'Personal W-2 (Wages)', // APROBADO (D-295)
  net: 'Ganancia neta', // APROBADO (D-295)
  scheduleCTitle: (y: number) => `Schedule C (Form 1040) · ${y}`, // APROBADO (D-295)
  categoryLines: 'Línea de cada categoría', // APROBADO (D-295)
  categoryLinesNote: 'Se puede cambiar en Ajustes → Categorías de gastos. Confírmalo con tu contador.', // APROBADO (D-295)
  plNote: 'Ingresos cobrados en el año, sin el sales tax.', // APROBADO (D-295)
  plErrorLoad: 'No se pudo cargar el Profit & Loss. Revisa tu conexión e inténtalo de nuevo.', // D-200
  scheduleCLine: 'Línea del Schedule C', // D-200 (campo en Ajustes → Categorías de gastos)
  scheduleCLineHelp: 'Dónde va este gasto en el Schedule C. Confírmalo con tu contador.', // D-200
};

export type SummaryPlStrings = typeof summaryPlEs;

export const summaryPlEn: SummaryPlStrings = {
  tabSummary: 'Summary',
  previousYear: 'Previous year',
  nextYear: 'Next year',
  serviceDays: 'Service days',
  hours: 'Hours',
  paid: 'Paid',
  accounts: 'Accounts',
  noAccounts: 'No accounts.',
  current: 'Current',
  ended: 'Ended',
  since: (d) => `since ${d}`,
  byMonth: 'By month',
  noMonths: 'No approved work this year.',
  days: (n) => (n === 1 ? '1 day' : `${n} days`),
  total: (y) => `Total ${y}`,
  exportButton: 'Export (PDF / CSV)',
  summaryTitle: 'Employee summary',
  summaryHeader: ['Month', 'Days', 'Hours', 'Amount'],
  accountsHeader: ['Account', 'Client', 'From', 'To', 'Status'],
  errorLoad: "Couldn't load the summary. Check your connection and try again.",

  plTitle: 'Profit & Loss',
  plLine: 'Income, staff and expenses for the year',
  viewSummary: 'Summary',
  viewScheduleC: 'Schedule C',
  income: 'Income',
  contractLabor: '1099 staff (Contract labor)',
  wages: 'W-2 staff (Wages)',
  net: 'Net profit',
  scheduleCTitle: (y) => `Schedule C (Form 1040) · ${y}`,
  categoryLines: 'Line for each category',
  categoryLinesNote: 'You can change it in Settings → Expense categories. Confirm it with your accountant.',
  plNote: 'Income collected in the year, without sales tax.',
  plErrorLoad: "Couldn't load the Profit & Loss. Check your connection and try again.",
  scheduleCLine: 'Schedule C line',
  scheduleCLineHelp: 'Where this expense goes on Schedule C. Confirm it with your accountant.',
};

export function getSummaryPlStrings(locale: Locale): SummaryPlStrings {
  return locale === 'es' ? summaryPlEs : summaryPlEn;
}
