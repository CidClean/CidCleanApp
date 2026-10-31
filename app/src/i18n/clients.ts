import type { Locale } from './index';

/**
 * Textos de Clientes, Jobsites y pagos (hito 5). APROBADO = de una decisión o muestra aprobada;
 * D-200 = detalle menor del ejecutor (listado en el reporte del hito 5).
 */
export const clientsEs = {
  status: { active: 'Activo', paused: 'Pausado', terminated: 'Terminado' }, // APROBADO (D-056)
  atRisk: 'Margen en riesgo', // APROBADO (D-060, D-097)
  perMonth: (m: string) => `${m} al mes`, // APROBADO (muestra ronda 9: "$1,850.00 al mes")
  legacy: 'Previo a la app', // APROBADO (D-210)
  accountProvider: 'Proveedor de cuentas', // D-291
  accountProviderNote: 'Sus jobsites se manejan directo, sin quote ni contrato con el cliente final.', // D-291
  accountProviderError: 'No se pudo guardar. Inténtalo otra vez.', // D-200 (D-291)

  list: {
    kicker: 'Operaciones', // D-200 (D-226)
    statActive: 'Activos', // D-200 (D-226)
    statPaused: 'Pausados', // D-200 (D-226)
    statRisk: 'En riesgo', // D-200 (D-226)
    jobsitesCount: (n: number) => (n === 1 ? '1 jobsite' : `${n} jobsites`), // D-200 (D-226)
    empty: 'Todavía no hay clientes.', // D-200
    errorLoad: 'No se pudieron cargar las cuentas. Inténtalo otra vez.', // D-200 (mismo estilo de D-195)
    newClient: 'Nuevo cliente', // D-200: icono + de la barra (como D-185) y título del alta
    noJobsites: 'Sin jobsites.', // D-200
  },

  client: {
    barTitle: 'Cliente', // D-200
    name: 'Nombre de la empresa', // D-200
    phone: 'Teléfono', // APROBADO (muestras)
    email: 'Email', // APROBADO (muestras)
    address: 'Dirección', // APROBADO (flujo)
    notes: 'Notas', // D-200
    jobsites: 'Jobsites', // APROBADO (flujo)
    addJobsite: 'Agregar jobsite', // D-200
    create: 'Crear cliente', // D-200 (mismo patrón de "Crear empleado", D-171)
    errorName: 'Escribe el nombre de la empresa.', // D-200
    errorLoad: 'No se pudo cargar el cliente. Inténtalo otra vez.', // D-200
    errorSave: 'No se pudo guardar. Inténtalo otra vez.', // APROBADO (D-195)
    none: '—', // D-200
  },

  jobsite: {
    barTitle: 'Jobsite', // APROBADO (muestra ronda 6)
    tabSummary: 'Resumen', // APROBADO (D-055)
    tabDocuments: 'Documentos', // APROBADO (D-055)
    tabStaff: 'Personal', // APROBADO (D-055)
    tabSchedule: 'Schedule y Work', // D-235 (reemplaza Horario)
    address: 'Dirección', // APROBADO (flujo)
    plusCode: 'Plus Code', // APROBADO (D-211)
    plusCodeHint: 'Por ejemplo: 66G8+4P Naples, Florida', // APROBADO (D-211)
    coordinates: (c: string) => `Ubicación: ${c}`, // D-200
    contact: 'Contacto principal', // APROBADO (muestra ronda 6)
    emergency: 'Contacto de emergencia', // APROBADO (muestra ronda 6)
    frequency: 'Frecuencia', // APROBADO (muestra ronda 6)
    estHours: 'Horas estimadas por visita', // D-200 (D-210: horas estimadas del walkthrough)
    startDate: 'Inicio del contrato', // D-200
    rate: 'Tarifa mensual', // APROBADO (D-055)
    walkthrough: 'Walkthrough', // APROBADO (flujo: resumen del walkthrough)
    walkthroughVersion: (n: number) => `Versión ${n}`, // D-200
    status: 'Estado', // APROBADO (D-056)
    edit: 'Editar', // APROBADO (D-174)
    none: '—', // D-200
    errorLoad: 'No se pudo cargar el jobsite. Inténtalo otra vez.', // D-200
    errorStatus: 'No se pudo cambiar el estado. Inténtalo otra vez.', // APROBADO (D-195)
    pauseTitle: (n: string) => `¿Pausar ${n}?`, // D-200 (mismo patrón de D-173)
    pauseBody: 'Se detienen las visitas y los ingresos esperados. El personal se conserva.', // D-200 (texto de D-210)
    terminateTitle: (n: string) => `¿Terminar ${n}?`, // D-200
    terminateBody: 'Se detienen las visitas y los ingresos esperados, y se cierra el personal asignado. No se puede reabrir.', // D-200 (D-210)
    confirmPause: 'Pausar', // D-200
    confirmTerminate: 'Terminar', // D-200
    rateTitle: 'Tarifa mensual', // D-200: hoja para editar la tarifa de un cliente previo
    rateQuoteNote: 'La tarifa cambia con un quote nuevo.', // D-200 (D-210)
  },

  margin: {
    cost: 'Costo del personal', // APROBADO (muestra ronda 6)
    of: (cost: string, rate: string) => `${cost} de ${rate}`, // APROBADO (muestra ronda 6: "$1,910.00 de $1,850.00")
    incomplete: 'Faltan horas estimadas o visitas por mes para calcular todo el costo.', // D-200
  },

  form: {
    newTitle: 'Nuevo jobsite', // D-200
    editTitle: 'Editar jobsite', // D-200
    name: 'Nombre del jobsite', // D-200
    contactName: 'Nombre', // D-200
    contactPhone: 'Teléfono', // D-200
    contactEmail: 'Email', // D-200
    emergencyName: 'Nombre', // APROBADO (D-210)
    emergencyPhone: 'Teléfono', // APROBADO (D-210)
    emergencyRelation: 'Relación', // APROBADO (D-210)
    emergencyEmail: 'Correo', // APROBADO (D-210)
    frequencyType: 'Tipo', // APROBADO (D-075)
    daily: 'Diaria', // APROBADO (D-105)
    weekly: 'Semanal', // APROBADO (muestra ronda 8)
    other: 'Otra', // APROBADO (D-080)
    describe: 'Describe la frecuencia', // APROBADO (D-080)
    visitsPerMonth: 'Visitas por mes', // D-200: para calcular el margen con frecuencia Otra
    days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], // APROBADO (D-038)
    and: 'y', // APROBADO (muestra ronda 6: "Lun, Mié y Vie")
    datePlaceholder: 'MM/DD/AAAA', // D-200 (como la fecha de seguimiento, D-205)
    rate: 'Tarifa mensual', // APROBADO (D-055)
    create: 'Crear jobsite', // D-200
    errorName: 'Escribe el nombre del jobsite.', // D-200
    errorAddress: 'Escribe la dirección.', // D-200 (mismo texto del sitio del lead)
    errorPlusCode: 'Escribe un Plus Code válido, por ejemplo 66G8+4P Naples, Florida.', // D-200
    errorEmail: 'Escribe un correo válido.', // APROBADO (D-156)
    errorHours: 'Escribe las horas, por ejemplo 3 o 2.5.', // D-200
    errorVisits: 'Escribe un número de visitas por mes.', // D-200
    errorDate: 'Escribe una fecha válida, por ejemplo 11/01/2026.', // D-200
    errorRate: 'Escribe un monto, por ejemplo 1850.', // D-200
    errorSave: 'No se pudo guardar. Inténtalo otra vez.', // APROBADO (D-195)
  },

  docs: {
    sow: 'SOW', // APROBADO (flujo)
    contract: 'Contrato', // APROBADO (flujo)
    other: 'Otro documento', // D-200
    detail: (v: number, date: string) => `Versión ${v} · ${date}`, // D-200
    missing: 'Sin archivo', // APROBADO (D-175)
    upload: 'Subir documento', // APROBADO (D-175)
    chooseKind: 'Qué documento subes', // D-200: título de la hoja
    title: 'Nombre del documento', // D-200: para "Otro documento"
    chooseFile: 'Elegir PDF', // D-200
    errorTitle: 'Escribe el nombre del documento.', // D-200
    errorUpload: 'No se pudo subir el documento. Inténtalo otra vez.', // APROBADO (D-195)
    errorOpen: 'No se pudo abrir el documento. Inténtalo otra vez.', // APROBADO (D-195)
  },

  staff: {
    empty: 'Todavía no hay personal asignado.', // D-200
    since: (date: string) => `Desde ${date}`, // D-200
    until: (date: string) => `Hasta ${date}`, // D-200
    assign: 'Asignar empleado', // D-200
    assignToJobsite: 'Asignar a un jobsite', // D-200: botón en Pagos del empleado
    noPay: 'Sin pago definido', // D-200
    errorLoad: 'No se pudo cargar el personal. Inténtalo otra vez.', // D-200
  },

  pay: {
    title: (jobsite: string) => `Pago en ${jobsite}`, // APROBADO (muestra ronda 6)
    hourly: 'Por hora', // APROBADO (D-059)
    fixed: 'Tarifa fija', // APROBADO (D-059)
    hourlyRate: 'Tarifa por hora', // APROBADO (D-059)
    guaranteed: 'Horas garantizadas (opcional)', // APROBADO (D-059)
    guaranteedLine: (h: string) => `Con ${h} h garantizadas, si trabaja menos se le pagan ${h} h.`, // APROBADO (muestra ronda 6, en general)
    period: 'Cobra', // APROBADO (D-100)
    periods: { visit: 'Por visita', week: 'Por semana', month: 'Por mes' }, // APROBADO (D-100)
    amount: 'Monto', // APROBADO (D-100)
    perVisit: (m: string) => `Se pagan ${m} por cada visita trabajada.`, // APROBADO (D-100)
    perWeek: (m: string) => `Se pagan ${m} por cada semana trabajada.`, // D-200 (mismo patrón de D-100)
    perMonth: (m: string) => `Se pagan ${m} por cada mes trabajado.`, // D-200 (mismo patrón de D-100)
    from: 'Desde', // D-200: fecha de inicio del pago (D-210)
    save: 'Guardar', // APROBADO (D-096)
    minWage: 'El mínimo para W-2 es $15.00 por hora.', // APROBADO (D-061, ronda 11)
    errorRate: 'Escribe la tarifa, por ejemplo 18.', // D-200
    errorHours: 'Escribe las horas, por ejemplo 3.', // D-200
    errorAmount: 'Escribe el monto, por ejemplo 120.', // D-200
    errorDate: 'Escribe una fecha válida, por ejemplo 11/01/2026.', // D-200
    errorPast: 'El pago no puede empezar antes de hoy.', // D-200 (D-210: sin efecto retroactivo)
    errorSave: 'No se pudo guardar. Inténtalo otra vez.', // APROBADO (D-195)
    current: 'Pago vigente', // D-200
    nextChange: (date: string) => `Cambia el ${date}`, // D-200
    summaryHour: (m: string) => `${m}/h`, // D-200
    summaryGuaranteed: (h: number) => `${h} h garantizadas`, // D-200
    summaryVisit: (m: string) => `${m} por visita`, // D-200
    summaryWeek: (m: string) => `${m} por semana`, // D-200
    summaryMonth: (m: string) => `${m} al mes`, // D-200
  },

  assign: {
    title: 'Asignar empleado', // D-200
    titleJobsite: 'Asignar a un jobsite', // D-200
    employee: 'Empleado', // D-200
    jobsite: 'Jobsite', // D-200
    start: 'Fecha de inicio', // D-200 (D-210)
    submit: 'Asignar', // D-200
    errorStart: 'La fecha de inicio no puede ser anterior a hoy.', // D-200
    errorSave: 'No se pudo asignar. Inténtalo otra vez.', // D-200
    errorContract: 'El contrato de este jobsite aún no está firmado por ambas partes. No se puede asignar personal.', // D-200 (D-283)
    errorIca: 'Este contratista 1099 no tiene el ICA firmado por ambas partes y el W-9 firmado. No se le puede asignar trabajo.', // D-200 (D-285)
    remove: 'Quitar del jobsite', // D-200 (D-210: quitar con fecha de fin)
    end: 'Fecha de fin', // D-200
    removeTitle: (n: string, j: string) => `¿Quitar a ${n} de ${j}?`, // D-200 (patrón de D-173)
    removeBody: (date: string) => `Deja de estar asignado después del ${date}.`, // D-200
    confirmRemove: 'Quitar', // D-200
    errorEnd: 'La fecha de fin no puede ser anterior a hoy.', // D-200
    noEmployees: 'No hay empleados activos para asignar.', // D-200
    noJobsites: 'No hay jobsites activos.', // D-200
  },
};

export type ClientsStrings = typeof clientsEs;

/** English (D-157): translated with the screen and purpose of each text; not yet reviewed by the owner. */
export const clientsEn: ClientsStrings = {
  status: { active: 'Active', paused: 'Paused', terminated: 'Terminated' },
  atRisk: 'Margin at risk',
  perMonth: (m: string) => `${m} per month`,
  legacy: 'Before the app',
  accountProvider: 'Account provider',
  accountProviderNote: 'Its jobsites are handled directly, with no quote or contract with the end client.',
  accountProviderError: "Couldn't save. Try again.",
  list: {
    kicker: 'Operations',
    statActive: 'Active',
    statPaused: 'Paused',
    statRisk: 'At risk',
    jobsitesCount: (n: number) => (n === 1 ? '1 jobsite' : `${n} jobsites`),
    empty: 'No clients yet.',
    errorLoad: "Couldn't load the accounts. Try again.",
    newClient: 'New client',
    noJobsites: 'No jobsites.',
  },
  client: {
    barTitle: 'Client',
    name: 'Company name',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    notes: 'Notes',
    jobsites: 'Jobsites',
    addJobsite: 'Add jobsite',
    create: 'Create client',
    errorName: 'Enter the company name.',
    errorLoad: "Couldn't load the client. Try again.",
    errorSave: "Couldn't save. Try again.",
    none: '—',
  },
  jobsite: {
    barTitle: 'Jobsite',
    tabSummary: 'Summary',
    tabDocuments: 'Documents',
    tabStaff: 'Staff',
    tabSchedule: 'Schedule & Work',
    address: 'Address',
    plusCode: 'Plus Code',
    plusCodeHint: 'For example: 66G8+4P Naples, Florida',
    coordinates: (c: string) => `Location: ${c}`,
    contact: 'Main contact',
    emergency: 'Emergency contact',
    frequency: 'Frequency',
    estHours: 'Estimated hours per visit',
    startDate: 'Contract start',
    rate: 'Monthly rate',
    walkthrough: 'Walkthrough',
    walkthroughVersion: (n: number) => `Version ${n}`,
    status: 'Status',
    edit: 'Edit',
    none: '—',
    errorLoad: "Couldn't load the jobsite. Try again.",
    errorStatus: "Couldn't change the status. Try again.",
    pauseTitle: (n: string) => `Pause ${n}?`,
    pauseBody: 'Visits and expected income stop. The staff stays assigned.',
    terminateTitle: (n: string) => `End ${n}?`,
    terminateBody: 'Visits and expected income stop and the assigned staff is closed. It cannot be reopened.',
    confirmPause: 'Pause',
    confirmTerminate: 'End',
    rateTitle: 'Monthly rate',
    rateQuoteNote: 'The rate changes with a new quote.',
  },
  margin: {
    cost: 'Staff cost',
    of: (cost: string, rate: string) => `${cost} of ${rate}`,
    incomplete: 'Estimated hours or visits per month are missing to calculate the full cost.',
  },
  form: {
    newTitle: 'New jobsite',
    editTitle: 'Edit jobsite',
    name: 'Jobsite name',
    contactName: 'Name',
    contactPhone: 'Phone',
    contactEmail: 'Email',
    emergencyName: 'Name',
    emergencyPhone: 'Phone',
    emergencyRelation: 'Relationship',
    emergencyEmail: 'Email',
    frequencyType: 'Type',
    daily: 'Daily',
    weekly: 'Weekly',
    other: 'Other',
    describe: 'Describe the frequency',
    visitsPerMonth: 'Visits per month',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    and: 'and',
    datePlaceholder: 'MM/DD/YYYY',
    rate: 'Monthly rate',
    create: 'Create jobsite',
    errorName: 'Enter the jobsite name.',
    errorAddress: 'Enter the address.',
    errorPlusCode: 'Enter a valid Plus Code, for example 66G8+4P Naples, Florida.',
    errorEmail: 'Enter a valid email.',
    errorHours: 'Enter the hours, for example 3 or 2.5.',
    errorVisits: 'Enter a number of visits per month.',
    errorDate: 'Enter a valid date, for example 11/01/2026.',
    errorRate: 'Enter an amount, for example 1850.',
    errorSave: "Couldn't save. Try again.",
  },
  docs: {
    sow: 'SOW',
    contract: 'Contract',
    other: 'Other document',
    detail: (v: number, date: string) => `Version ${v} · ${date}`,
    missing: 'No file',
    upload: 'Upload document',
    chooseKind: 'Which document are you uploading',
    title: 'Document name',
    chooseFile: 'Choose PDF',
    errorTitle: 'Enter the document name.',
    errorUpload: "Couldn't upload the document. Try again.",
    errorOpen: "Couldn't open the document. Try again.",
  },
  staff: {
    empty: 'No staff assigned yet.',
    since: (date: string) => `Since ${date}`,
    until: (date: string) => `Until ${date}`,
    assign: 'Assign employee',
    assignToJobsite: 'Assign to a jobsite',
    noPay: 'No pay set',
    errorLoad: "Couldn't load the staff. Try again.",
  },
  pay: {
    title: (jobsite: string) => `Pay at ${jobsite}`,
    hourly: 'Hourly',
    fixed: 'Fixed rate',
    hourlyRate: 'Hourly rate',
    guaranteed: 'Guaranteed hours (optional)',
    guaranteedLine: (h: string) => `With ${h} guaranteed hours, if they work less they are paid ${h} h.`,
    period: 'Paid',
    periods: { visit: 'Per visit', week: 'Per week', month: 'Per month' },
    amount: 'Amount',
    perVisit: (m: string) => `${m} is paid for each visit worked.`,
    perWeek: (m: string) => `${m} is paid for each week worked.`,
    perMonth: (m: string) => `${m} is paid for each month worked.`,
    from: 'Starting',
    save: 'Save',
    minWage: 'The minimum for W-2 is $15.00 per hour.',
    errorRate: 'Enter the rate, for example 18.',
    errorHours: 'Enter the hours, for example 3.',
    errorAmount: 'Enter the amount, for example 120.',
    errorDate: 'Enter a valid date, for example 11/01/2026.',
    errorPast: "Pay can't start before today.",
    errorSave: "Couldn't save. Try again.",
    current: 'Current pay',
    nextChange: (date: string) => `Changes on ${date}`,
    summaryHour: (m: string) => `${m}/h`,
    summaryGuaranteed: (h: number) => `${h} h guaranteed`,
    summaryVisit: (m: string) => `${m} per visit`,
    summaryWeek: (m: string) => `${m} per week`,
    summaryMonth: (m: string) => `${m} per month`,
  },
  assign: {
    title: 'Assign employee',
    titleJobsite: 'Assign to a jobsite',
    employee: 'Employee',
    jobsite: 'Jobsite',
    start: 'Start date',
    submit: 'Assign',
    errorStart: "The start date can't be before today.",
    errorSave: "Couldn't assign. Try again.",
    errorContract: "This jobsite's contract isn't signed by both parties yet. Staff can't be assigned.",
    errorIca: "This 1099 contractor doesn't have the ICA signed by both parties and a signed W-9. Work can't be assigned.",
    remove: 'Remove from jobsite',
    end: 'End date',
    removeTitle: (n: string, j: string) => `Remove ${n} from ${j}?`,
    removeBody: (date: string) => `No longer assigned after ${date}.`,
    confirmRemove: 'Remove',
    errorEnd: "The end date can't be before today.",
    noEmployees: 'No active employees to assign.',
    noJobsites: 'No active jobsites.',
  },
};

export function getClientsStrings(locale: Locale): ClientsStrings {
  return locale === 'es' ? clientsEs : clientsEn;
}
