import type { Locale } from './index';

/**
 * Textos del Inicio nuevo del admin y de Estadísticas (órdenes 38 y 39). APROBADO = de la muestra aprobada
 * surveys/dashboard-estadisticas-aprobado.html (D-253); D-200 = detalle menor del ejecutor (listado en el informe).
 */
export const statisticsEs = {
  title: 'Estadísticas', // APROBADO (D-253)
  kicker: 'Rendimiento', // APROBADO (muestra D-253)
  tabs: { accounts: 'Cuentas', employees: 'Empleados', trend: 'Tendencia' }, // APROBADO (D-253)
  loading: 'Cargando', // D-200
  errorLoad: 'No se pudieron cargar las estadísticas. Inténtalo otra vez.', // D-200
  empty: 'No hay trabajo ni ingresos en este periodo.', // D-200
  account: 'Cuenta', // D-200
  marginChip: (pct: string) => `margen ${pct}%`, // APROBADO (muestra D-253)
  accountLine: (client: string, shifts: number, visits: number) =>
    `${client} · ${shifts} ${shifts === 1 ? 'turno' : 'turnos'} en ${visits} ${visits === 1 ? 'visita' : 'visitas'}`, // APROBADO (muestra D-253)
  workedHours: 'Horas trabajadas', // APROBADO
  workedHoursSub: 'reales (clock in → out)', // APROBADO
  paidHours: 'Horas pagadas', // APROBADO
  paidHoursSub: 'con las horas garantizadas', // APROBADO (muestra: "con las 4 h garantizadas")
  unworked: 'Pagadas sin trabajar', // APROBADO
  usedChip: (pct: string) => `${pct}% aprovechado`, // APROBADO
  unworkedBar: 'Horas trabajadas contra pagadas', // APROBADO (lector de pantalla de la barra)
  unworkedNote: 'Lo que pagas por garantía y no se trabaja. Si sube, revisa la duración o las horas garantizadas.', // APROBADO
  incomePerHour: 'Ingreso por hora', // APROBADO
  incomePerHourSub: 'por hora trabajada', // APROBADO
  costPerHour: 'Costo por hora', // APROBADO
  leftPerHour: (m: string) => `te quedan ${m}/h`, // APROBADO
  realDuration: 'Duración real', // APROBADO
  vsEstimated: (h: string) => `vs ${h} estimadas`, // APROBADO
  noEstimate: 'sin duración estimada', // D-200
  punctuality: 'Puntualidad', // APROBADO
  punctualityNone: (self: number, total: number) => `falta que marquen ellos mismos (${self} de ${total})`, // APROBADO
  punctualityLine: (onTime: number, self: number) => `${onTime} de ${self} a tiempo (hasta 5 min tarde)`, // D-200 (a tiempo = hasta 5 min, D-200)
  shifts: 'Turnos programados vs trabajados', // APROBADO
  shiftsOf: (worked: number, scheduled: number) => `${worked} de ${scheduled}`, // APROBADO
  missingChip: (n: number) => `${n} sin trabajo`, // APROBADO
  noMissingChip: 'sin faltas', // D-200
  shiftsNote: 'Un turno programado sin registro de trabajo cuenta como falta. Toca para ver el día.', // APROBADO
  absence: 'falta', // APROBADO
  byEmployee: (period: string) => `Por empleado · ${period}`, // APROBADO
  employeeRow: (worked: number, scheduled: number, hours: string, cost: string) => `${worked}/${scheduled} · ${hours} · ${cost}`, // APROBADO
  employeeNote: 'turnos trabajados / programados · horas pagadas · costo', // APROBADO (muestra: "horas"; D-200 "pagadas")
  // Empleados (D-253: turnos trabajados/programados, horas y costo)
  shiftsShort: 'Turnos', // D-200
  cost: 'Costo', // D-200
  absences: 'Faltas', // D-200
  noEmployees: 'Nadie trabajó ni estuvo programado en este periodo.', // D-200
  // Tendencia
  trendTitle: 'Tendencia · ingreso, personal y profit', // APROBADO
  trendChart: (lines: string) => `Tendencia por mes. ${lines}`, // D-200 (lector de pantalla)
  income: 'Ingreso', // APROBADO
  staff: 'Personal', // APROBADO
  expenses: 'Gastos', // D-200 (D-253 tendencia con gastos, orden 38)
  profit: 'Profit', // APROBADO
  // Exportar (D-253)
  exportCsv: 'Compartir CSV', // D-200 (como Accounting)
  exportPdf: 'PDF de estadísticas', // D-200
  shareUnavailable: 'Compartir llega con la versión 1.3.0 de la app.', // D-200 (como Accounting)
  shareError: 'No se pudo compartir. Inténtalo otra vez.', // D-200
  pdfTitle: (period: string) => `Estadísticas · ${period}`, // D-200
  csv: {
    account: 'Cuenta',
    client: 'Cliente',
    employee: 'Empleado',
    type: 'Tipo',
    month: 'Mes',
    day: 'Día',
    visits: 'Visitas',
    shifts: 'Turnos',
    scheduled: 'Turnos programados',
    worked: 'Turnos trabajados',
    workedHours: 'Horas trabajadas',
    paidHours: 'Horas pagadas',
    unworkedHours: 'Horas pagadas sin trabajar',
    unworkedAmount: 'Pagado sin trabajar',
    used: '% aprovechado',
    expected: 'Ingreso esperado',
    staff: 'Personal',
    expenses: 'Gastos',
    profit: 'Profit',
    margin: 'Margen %',
    incomePerHour: 'Ingreso por hora',
    costPerHour: 'Costo por hora',
    avgHours: 'Duración real promedio (h)',
    estHours: 'Duración estimada (h)',
    punctualSelf: 'Entradas propias',
    punctualOnTime: 'A tiempo',
    cost: 'Costo',
    absences: 'Faltas',
  }, // D-200
  // Inicio del admin (D-253)
  home: {
    profitOf: (month: string) => `Profit de ${month} · sobre lo esperado`, // APROBADO
    profitLine: (income: string, staff: string, expenses: string) => `Ingreso ${income} · Personal ${staff} · Gastos ${expenses}`, // APROBADO
    margin: (pct: string) => `Margen ${pct}%`, // APROBADO
    receivable: 'Por cobrar', // APROBADO
    receivableSub: (month: string) => `${month} sin marcar recibido`, // APROBADO
    toApprove: 'Por aprobar', // APROBADO
    toApproveSub: 'turnos esperando', // APROBADO
    today: (time: string) => `Hoy · ${time}`, // APROBADO
    scheduledChip: (n: number) => `${n} ${n === 1 ? 'programado' : 'programados'}`, // APROBADO
    noClockIn: 'sin clock in', // APROBADO
    clockedIn: (time: string) => `entró ${time}`, // D-200
    clockedOut: (time: string) => `salió ${time}`, // D-200
    weekHours: 'Horas de esta semana · tope 32 h', // APROBADO
    weekRow: (worked: string, programmed: string) => `${worked} / ${programmed} h`, // APROBADO
    pipeline: 'Pipeline', // APROBADO
    pipelineSub: (quotes: number) => `leads abiertos · ${quotes} ${quotes === 1 ? 'quote enviado' : 'quotes enviados'}`, // APROBADO
    accounts: 'Cuentas', // APROBADO
    accountsSub: (active: number, risk: number | null) =>
      `${active === 1 ? 'activa' : 'activas'}${risk === null ? '' : ` · ${risk} en riesgo`}`, // APROBADO
  },
};

export type StatisticsStrings = typeof statisticsEs;

export const statisticsEn: StatisticsStrings = {
  title: 'Statistics',
  kicker: 'Performance',
  tabs: { accounts: 'Accounts', employees: 'Employees', trend: 'Trend' },
  loading: 'Loading',
  errorLoad: "Couldn't load statistics. Try again.",
  empty: 'No work or income in this period.',
  account: 'Account',
  marginChip: (pct: string) => `margin ${pct}%`,
  accountLine: (client: string, shifts: number, visits: number) =>
    `${client} · ${shifts} ${shifts === 1 ? 'shift' : 'shifts'} in ${visits} ${visits === 1 ? 'visit' : 'visits'}`,
  workedHours: 'Hours worked',
  workedHoursSub: 'actual (clock in → out)',
  paidHours: 'Hours paid',
  paidHoursSub: 'with guaranteed hours',
  unworked: 'Paid, not worked',
  usedChip: (pct: string) => `${pct}% used`,
  unworkedBar: 'Hours worked versus paid',
  unworkedNote: "What you pay for guarantees that isn't worked. If it grows, check the duration or the guaranteed hours.",
  incomePerHour: 'Income per hour',
  incomePerHourSub: 'per hour worked',
  costPerHour: 'Cost per hour',
  leftPerHour: (m: string) => `you keep ${m}/h`,
  realDuration: 'Actual duration',
  vsEstimated: (h: string) => `vs ${h} estimated`,
  noEstimate: 'no estimated duration',
  punctuality: 'Punctuality',
  punctualityNone: (self: number, total: number) => `needs them to clock in themselves (${self} of ${total})`,
  punctualityLine: (onTime: number, self: number) => `${onTime} of ${self} on time (up to 5 min late)`,
  shifts: 'Scheduled vs worked shifts',
  shiftsOf: (worked: number, scheduled: number) => `${worked} of ${scheduled}`,
  missingChip: (n: number) => `${n} not worked`,
  noMissingChip: 'no absences',
  shiftsNote: 'A scheduled shift with no work record counts as an absence. Tap to see the day.',
  absence: 'absence',
  byEmployee: (period: string) => `By employee · ${period}`,
  employeeRow: (worked: number, scheduled: number, hours: string, cost: string) => `${worked}/${scheduled} · ${hours} · ${cost}`,
  employeeNote: 'shifts worked / scheduled · hours paid · cost',
  shiftsShort: 'Shifts',
  cost: 'Cost',
  absences: 'Absences',
  noEmployees: 'Nobody worked or was scheduled in this period.',
  trendTitle: 'Trend · income, staff and profit',
  trendChart: (lines: string) => `Monthly trend. ${lines}`,
  income: 'Income',
  staff: 'Staff',
  expenses: 'Expenses',
  profit: 'Profit',
  exportCsv: 'Share CSV',
  exportPdf: 'Statistics PDF',
  shareUnavailable: 'Sharing arrives with version 1.3.0 of the app.',
  shareError: "Couldn't share. Try again.",
  pdfTitle: (period: string) => `Statistics · ${period}`,
  csv: {
    account: 'Account',
    client: 'Client',
    employee: 'Employee',
    type: 'Type',
    month: 'Month',
    day: 'Day',
    visits: 'Visits',
    shifts: 'Shifts',
    scheduled: 'Scheduled shifts',
    worked: 'Worked shifts',
    workedHours: 'Hours worked',
    paidHours: 'Hours paid',
    unworkedHours: 'Hours paid not worked',
    unworkedAmount: 'Paid not worked',
    used: '% used',
    expected: 'Expected income',
    staff: 'Staff',
    expenses: 'Expenses',
    profit: 'Profit',
    margin: 'Margin %',
    incomePerHour: 'Income per hour',
    costPerHour: 'Cost per hour',
    avgHours: 'Average actual duration (h)',
    estHours: 'Estimated duration (h)',
    punctualSelf: 'Own clock-ins',
    punctualOnTime: 'On time',
    cost: 'Cost',
    absences: 'Absences',
  },
  home: {
    profitOf: (month: string) => `${month} profit · over expected`,
    profitLine: (income: string, staff: string, expenses: string) => `Income ${income} · Staff ${staff} · Expenses ${expenses}`,
    margin: (pct: string) => `Margin ${pct}%`,
    receivable: 'To collect',
    receivableSub: (month: string) => `${month} not marked received`,
    toApprove: 'To approve',
    toApproveSub: 'shifts waiting',
    today: (time: string) => `Today · ${time}`,
    scheduledChip: (n: number) => `${n} scheduled`,
    noClockIn: 'no clock in',
    clockedIn: (time: string) => `in ${time}`,
    clockedOut: (time: string) => `out ${time}`,
    weekHours: 'Hours this week · 32 h cap',
    weekRow: (worked: string, programmed: string) => `${worked} / ${programmed} h`,
    pipeline: 'Pipeline',
    pipelineSub: (quotes: number) => `open leads · ${quotes} ${quotes === 1 ? 'quote sent' : 'quotes sent'}`,
    accounts: 'Accounts',
    accountsSub: (active: number, risk: number | null) => `active${risk === null ? '' : ` · ${risk} at risk`}`,
  },
};

export function getStatisticsStrings(locale: Locale): StatisticsStrings {
  return locale === 'es' ? statisticsEs : statisticsEn;
}
