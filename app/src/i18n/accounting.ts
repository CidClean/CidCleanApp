import type { Locale } from './index';

/**
 * Textos de Accounting (hito 7, órdenes 25 a 27). APROBADO = de una decisión o muestra aprobada (ronda 7, D-063 a
 * D-069, D-098, D-102, D-103, D-215, D-238); D-200 = detalle menor del ejecutor (listado en el informe del hito 7).
 */
export const accountingEs = {
  title: 'Accounting', // APROBADO (D-134)
  months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  monthTitle: (m: string, y: number) => `${m[0].toUpperCase()}${m.slice(1)} ${y}`, // APROBADO (muestra ronda 7: "Octubre 2026")
  rangeTitle: (a: string, b: string) => `${a} – ${b}`, // D-200
  previousMonth: 'Mes anterior', // D-200 (lector de pantalla)
  nextMonth: 'Mes siguiente', // D-200
  range: 'Rango', // D-200 (D-215: por mes o rango)
  rangeTitleDialog: 'Rango de meses', // D-200
  from: 'Desde', // D-200
  to: 'Hasta', // D-200
  apply: 'Aplicar', // D-200
  oneMonth: 'Un mes', // D-200
  cancel: 'Cancelar', // D-200
  global: 'Global', // APROBADO (D-069)
  byAccount: 'Por cuenta', // APROBADO (D-069)
  account: 'Cuenta', // APROBADO (D-102)
  chooseAccount: 'Elige una cuenta', // D-200
  // Dashboard (D-068, D-215)
  profitMonth: 'Profit del mes', // APROBADO (muestra D-226: "Profit del mes")
  profitRange: 'Profit del periodo', // D-200
  profitNote: 'Sobre lo esperado', // D-200 (D-215: profit sobre lo esperado)
  receivedPending: (r: string, p: string) => `Recibido ${r} · Pendiente ${p}`, // APROBADO (muestra ronda 7)
  income: 'Ingresos', // APROBADO (D-068)
  staff: 'Personal', // APROBADO (D-068)
  expenses: 'Gastos', // APROBADO (D-068)
  profit: 'Profit', // APROBADO (D-068)
  recurring: 'Recurrentes', // APROBADO (orden 27)
  export: 'Exportar', // APROBADO (orden 27)
  recurringCount: (n: number) => (n === 1 ? '1 activo' : `${n} activos`), // D-200
  exportLine: 'CSV y PDF', // D-200
  marginRisk: 'Margen en riesgo', // APROBADO (D-060, D-097)
  marginRiskLine: (names: string) => `El trabajo aprobado del mes ya iguala o pasa lo que cobra: ${names}`, // D-200 (D-243)
  errorLoad: 'No se pudo cargar Accounting. Inténtalo otra vez.', // D-200
  noAccess: 'No tienes permiso para ver esto.', // D-200
  // Ingresos (D-063, D-064, D-238)
  incomeTitle: (period: string) => `Ingresos · ${period.toLowerCase()}`, // APROBADO (muestra ronda 7: "Ingresos · octubre 2026")
  expected: 'Esperado', // APROBADO (D-063)
  received: 'Recibido', // APROBADO (D-063, D-064)
  pending: 'Pendiente', // APROBADO (D-063)
  receivedDate: 'Fecha de cobro', // APROBADO (D-064)
  adjust: 'Ajustar', // APROBADO (orden 27, D-238)
  adjustTitle: 'Ajustar ingreso', // D-200
  adjustAmount: 'Monto del mes', // D-200
  adjustNote: 'Nota', // APROBADO (D-238: nota obligatoria)
  adjustNoteHint: 'Por ejemplo, un extra hablado de palabra.', // APROBADO (D-238)
  adjustNoteRequired: 'Escribe la nota del ajuste.', // D-200
  adjusted: (from: string) => `Ajustado (calculado ${from})`, // D-200
  adjustedBy: (name: string) => `por ${name}`, // D-200
  calculated: 'Calculado', // D-200
  save: 'Guardar', // APROBADO (D-103)
  amountError: 'Escribe un monto válido, por ejemplo 250.00.', // D-200
  extras: 'Extras', // D-200 (D-238)
  extraPendingAfter: 'Aceptado después de marcar recibido: pendiente', // D-200
  noIncome: 'No hay ingresos en este periodo.', // D-200
  errorSave: 'No se pudo guardar. Inténtalo otra vez.', // D-200
  dateError: 'La fecha de cobro no puede ser futura.', // D-200
  // Gastos (D-065, D-098)
  expensesTitle: (period: string) => `Gastos · ${period.toLowerCase()}`, // D-200 (patrón de la muestra de ingresos)
  newExpense: 'Nuevo gasto', // APROBADO (muestra ronda 7)
  editExpense: 'Editar gasto', // D-200
  jobsite: 'Jobsite', // APROBADO (D-065)
  chooseJobsite: 'Elige un jobsite', // D-200
  category: 'Categoría', // APROBADO (D-065)
  date: 'Fecha', // APROBADO (D-098)
  amount: 'Monto', // APROBADO (D-065)
  note: 'Nota (opcional)', // D-200
  noExpenses: 'No hay gastos en este periodo.', // D-200
  globalExpense: 'Global', // APROBADO (D-065)
  generated: 'Recurrente', // D-200
  jobsiteRequired: 'Elige el jobsite.', // D-200
  categoryRequired: 'Elige la categoría.', // D-200
  // Recurrentes (D-066, D-103, D-215)
  recurringTitle: 'Gastos recurrentes', // APROBADO (muestra ronda 7)
  newRecurring: 'Nuevo gasto recurrente', // D-200
  editRecurring: 'Editar gasto recurrente', // D-200
  name: 'Nombre', // APROBADO (D-103)
  frequency: 'Frecuencia', // D-200 (D-215: mensual o anual)
  monthly: 'Cada mes', // APROBADO (muestra ronda 7)
  yearly: 'Cada año', // D-200
  generatedOnDay: 'Se genera el día', // APROBADO (D-103)
  inMonth: 'Mes', // D-200 (anual)
  active: 'Activo', // APROBADO (D-103)
  paused: 'Pausado', // D-200
  nameRequired: 'Escribe el nombre.', // D-200
  dayLine: (d: number) => `Día ${d}`, // D-200
  yearlyLine: (d: number, m: string) => `Cada año · ${d} de ${m}`, // D-200
  noRecurring: 'No hay gastos recurrentes.', // D-200
  recurringNote: 'Se genera solo el día elegido. Pausado no genera, y al reactivarlo no se recupera lo pausado.', // D-200 (D-215)
  // Personal (D-067, D-215)
  staffTitle: (period: string) => `Personal · ${period.toLowerCase()}`, // APROBADO (muestra ronda 7: "Personal · octubre 2026")
  byEmployee: 'Por empleado', // APROBADO (D-067)
  byJobsite: 'Por jobsite', // APROBADO (D-067)
  hours: (h: string) => `${h} h`, // APROBADO (D-231)
  staffNote: 'Lo que se debe a cada empleado, del trabajo aprobado. La app no registra si ya se pagó.', // D-200 (flujo)
  noStaff: 'No hay trabajo aprobado en este periodo.', // D-200
  // Exportar (D-215)
  exportTitle: 'Exportar', // APROBADO (orden 27)
  exportNote: 'CSV para abrir en una hoja de cálculo y PDF del dashboard, del periodo elegido.', // D-200
  reportProfit: 'Profit', // APROBADO (D-215)
  reportStaff: 'Costo de personal por empleado', // APROBADO (D-215)
  reportExpenses: 'Gastos por categoría', // APROBADO (D-215)
  reportIncome: 'Ingresos recibidos y pendientes', // APROBADO (D-215)
  shareCsv: 'Compartir CSV', // D-200
  sharePdf: 'PDF del dashboard', // APROBADO (D-215)
  shareUnavailable: 'Compartir llega con la versión 1.3.0 de la app.', // D-200 (como D-233)
  shareError: 'No se pudo compartir. Inténtalo otra vez.', // D-200
  csv: {
    month: 'Mes',
    expected: 'Esperado',
    received: 'Recibido',
    pending: 'Pendiente',
    staff: 'Personal',
    expenses: 'Gastos',
    profit: 'Profit',
    employee: 'Empleado',
    type: 'Tipo',
    jobsite: 'Jobsite',
    client: 'Cliente',
    hours: 'Horas',
    amount: 'Monto',
    category: 'Categoría',
    receivedOn: 'Fecha de cobro',
    note: 'Nota del ajuste',
  }, // D-200
  pdfTitle: (period: string) => `Dashboard · ${period}`, // D-200
  // Tarjeta de la cuenta en el jobsite (orden 27)
  accountCard: (period: string) => `Este mes · ${period}`, // D-200
  openAccounting: 'Ver en Accounting', // D-200
  // Ajustes → Categorías de gastos (orden 40; D-113, D-114, D-130, D-254). Mismo patrón que los motivos de lead perdido.
  categories: {
    row: 'Categorías de gastos', // APROBADO (D-089, D-114, D-130)
    count: (n: number) => (n === 1 ? '1 categoría' : `${n} categorías`), // D-200 (como "8 motivos", D-107)
    add: 'Agregar', // APROBADO (D-113)
    newTitle: 'Nueva categoría', // D-200
    editTitle: 'Editar categoría', // D-200
    labelEs: 'En español', // D-200
    labelEn: 'En inglés', // D-200
    errorEs: 'Escribe la categoría en español.', // D-200
    errorEn: 'Escribe la categoría en inglés.', // D-200
    errorLoad: 'No se pudieron cargar las categorías. Inténtalo otra vez.', // D-200
    errorSave: 'No se pudo guardar. Inténtalo otra vez.', // APROBADO (D-195)
    errorDelete: 'No se pudo eliminar la categoría. Inténtalo otra vez.', // D-200
    deleteTitle: (c: string) => `¿Eliminar ${c}?`, // D-200 (mismo patrón de D-201 y D-202)
    delete: 'Eliminar', // D-200
    deactivated: 'Algún gasto ya usa esta categoría: se quitó de la lista y esos gastos la conservan.', // D-200 (como D-207)
    editLabel: (c: string) => `Editar ${c}`, // D-200: solo lo lee el lector de pantalla
    deleteLabel: (c: string) => `Eliminar ${c}`, // D-200: solo lo lee el lector de pantalla
  },
};

export type AccountingStrings = typeof accountingEs;

export const accountingEn: AccountingStrings = {
  title: 'Accounting',
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  monthTitle: (m: string, y: number) => `${m} ${y}`,
  rangeTitle: (a: string, b: string) => `${a} – ${b}`,
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  range: 'Range',
  rangeTitleDialog: 'Month range',
  from: 'From',
  to: 'To',
  apply: 'Apply',
  oneMonth: 'One month',
  cancel: 'Cancel',
  global: 'Global',
  byAccount: 'By account',
  account: 'Account',
  chooseAccount: 'Choose an account',
  profitMonth: 'Profit this month',
  profitRange: 'Profit for the period',
  profitNote: 'On expected income',
  receivedPending: (r: string, p: string) => `Received ${r} · Pending ${p}`,
  income: 'Income',
  staff: 'Staff',
  expenses: 'Expenses',
  profit: 'Profit',
  recurring: 'Recurring',
  export: 'Export',
  recurringCount: (n: number) => (n === 1 ? '1 active' : `${n} active`),
  exportLine: 'CSV and PDF',
  marginRisk: 'Margin at risk',
  marginRiskLine: (names: string) => `This month's approved work already equals or exceeds what the client pays: ${names}`,
  errorLoad: "Accounting couldn't load. Try again.",
  noAccess: "You don't have permission to see this.",
  incomeTitle: (period: string) => `Income · ${period}`,
  expected: 'Expected',
  received: 'Received',
  pending: 'Pending',
  receivedDate: 'Payment date',
  adjust: 'Adjust',
  adjustTitle: 'Adjust income',
  adjustAmount: 'Amount for the month',
  adjustNote: 'Note',
  adjustNoteHint: 'For example, an extra agreed verbally.',
  adjustNoteRequired: 'Write the note for the adjustment.',
  adjusted: (from: string) => `Adjusted (calculated ${from})`,
  adjustedBy: (name: string) => `by ${name}`,
  calculated: 'Calculated',
  save: 'Save',
  amountError: 'Enter a valid amount, for example 250.00.',
  extras: 'Extras',
  extraPendingAfter: 'Accepted after it was marked received: pending',
  noIncome: 'No income in this period.',
  errorSave: "Couldn't save. Try again.",
  dateError: "The payment date can't be in the future.",
  expensesTitle: (period: string) => `Expenses · ${period}`,
  newExpense: 'New expense',
  editExpense: 'Edit expense',
  jobsite: 'Jobsite',
  chooseJobsite: 'Choose a jobsite',
  category: 'Category',
  date: 'Date',
  amount: 'Amount',
  note: 'Note (optional)',
  noExpenses: 'No expenses in this period.',
  globalExpense: 'Global',
  generated: 'Recurring',
  jobsiteRequired: 'Choose the jobsite.',
  categoryRequired: 'Choose the category.',
  recurringTitle: 'Recurring expenses',
  newRecurring: 'New recurring expense',
  editRecurring: 'Edit recurring expense',
  name: 'Name',
  frequency: 'Frequency',
  monthly: 'Every month',
  yearly: 'Every year',
  generatedOnDay: 'Created on day',
  inMonth: 'Month',
  active: 'Active',
  paused: 'Paused',
  nameRequired: 'Enter the name.',
  dayLine: (d: number) => `Day ${d}`,
  yearlyLine: (d: number, m: string) => `Every year · ${m} ${d}`,
  noRecurring: 'No recurring expenses.',
  recurringNote: "It's created on its own on the chosen day. Paused, it isn't created, and turning it back on doesn't recover the paused time.",
  staffTitle: (period: string) => `Staff · ${period}`,
  byEmployee: 'By employee',
  byJobsite: 'By jobsite',
  hours: (h: string) => `${h} h`,
  staffNote: "What's owed to each employee, from approved work. The app doesn't record whether it was paid.",
  noStaff: 'No approved work in this period.',
  exportTitle: 'Export',
  exportNote: 'CSV to open in a spreadsheet and a PDF of the dashboard, for the chosen period.',
  reportProfit: 'Profit',
  reportStaff: 'Staff cost by employee',
  reportExpenses: 'Expenses by category',
  reportIncome: 'Income received and pending',
  shareCsv: 'Share CSV',
  sharePdf: 'Dashboard PDF',
  shareUnavailable: 'Sharing arrives with version 1.3.0 of the app.',
  shareError: "Couldn't share. Try again.",
  csv: {
    month: 'Month',
    expected: 'Expected',
    received: 'Received',
    pending: 'Pending',
    staff: 'Staff',
    expenses: 'Expenses',
    profit: 'Profit',
    employee: 'Employee',
    type: 'Type',
    jobsite: 'Jobsite',
    client: 'Client',
    hours: 'Hours',
    amount: 'Amount',
    category: 'Category',
    receivedOn: 'Payment date',
    note: 'Adjustment note',
  },
  pdfTitle: (period: string) => `Dashboard · ${period}`,
  accountCard: (period: string) => `This month · ${period}`,
  openAccounting: 'See in Accounting',
  categories: {
    row: 'Expense categories',
    count: (n: number) => (n === 1 ? '1 category' : `${n} categories`),
    add: 'Add',
    newTitle: 'New category',
    editTitle: 'Edit category',
    labelEs: 'In Spanish',
    labelEn: 'In English',
    errorEs: 'Enter the category in Spanish.',
    errorEn: 'Enter the category in English.',
    errorLoad: "Couldn't load the categories. Try again.",
    errorSave: "Couldn't save. Try again.",
    errorDelete: "Couldn't delete the category. Try again.",
    deleteTitle: (c: string) => `Delete ${c}?`,
    delete: 'Delete',
    deactivated: 'An expense already uses this category: it was removed from the list and those expenses keep it.',
    editLabel: (c: string) => `Edit ${c}`,
    deleteLabel: (c: string) => `Delete ${c}`,
  },
};

export function getAccountingStrings(locale: Locale): AccountingStrings {
  return locale === 'es' ? accountingEs : accountingEn;
}
