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
    // Accounts con archivados (D-337 (3), muestra navegacion-aprobado (2) y (3)). Textos menores: D-200.
    tabActive: (n: number) => `Activas · ${n}`, // D-200 (muestra: "Active · N")
    tabArchived: (n: number) => `Archivadas · ${n}`, // D-200 (muestra: "Archived · N")
    search: 'Buscar cliente o jobsite', // D-200 (muestra: "Search client or jobsite")
    monthlyTotal: 'Total mensual', // D-200 (muestra: "Monthly total")
    perMo: (m: string) => `${m} /mes`, // D-200 (muestra: "$8,615 /mo")
    staff: (n: number) => (n === 1 ? '1 persona' : `${n} personas`), // D-200 (muestra: "2 staff")
    since: (d: string) => `desde ${d}`, // D-200 (muestra: "since Sep 17")
    terminated: 'Terminado', // D-200 (muestra: "Terminated")
    oneTime: 'One-time', // D-200 (orden 162: proyecto one-time, D-349)
    inactiveClient: 'Cliente inactivo', // D-200 (muestra: "Inactive client")
    range: (from: string, to: string) => `${from} – ${to}`, // D-200
    ended: 'Terminó', // D-200 (muestra: "Ended")
    was: (m: string) => `era ${m}/mes`, // D-200 (muestra: "was $X/mo")
    noResults: 'Ninguna cuenta con esa búsqueda.', // D-200
    emptyArchived: 'No hay cuentas archivadas.', // D-200
    months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], // D-200
  },

  client: {
    barTitle: 'Cliente', // D-200
    name: 'Nombre de la empresa', // D-200
    phone: 'Teléfono', // APROBADO (muestras)
    email: 'Email', // APROBADO (muestras)
    address: 'Dirección', // APROBADO (flujo)
    notes: 'Notas', // D-200
    contracts: 'Contratos', // D-200 (D-319 7)
    contractRow: (jobsite: string) => `Contrato · ${jobsite}`, // D-200
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
    terminateBody: 'Se detienen las visitas y los ingresos esperados, y se cierra el personal asignado. Se puede reactivar después.', // D-200 (D-210; D-340: se puede reactivar)
    confirmPause: 'Pausar', // D-200
    confirmTerminate: 'Terminar', // D-200
    rateTitle: 'Tarifa mensual', // D-200: hoja para editar la tarifa de un cliente previo
    rateQuoteNote: 'La tarifa cambia con un quote nuevo.', // D-200 (D-210)
  },

  // Detalle del jobsite (orden 150, D-339, D-340, muestra surveys/jobsite-detalle-aprobado.html). D-200 = detalle menor.
  detail: {
    clientLine: (n: string) => `Cliente: ${n}`, // muestra: "Client: X"
    call: 'Llamar', // muestra: "Call"
    email: 'Correo', // muestra: "Email"
    maps: 'Maps', // muestra: "Maps"
    schedule: 'Schedule', // muestra: "Schedule"
    tabSummary: 'Resumen', // D-339
    tabDocuments: 'Documentos', // D-339
    tabHistory: 'Historial', // D-339
    menu: 'Más acciones', // D-200 (botón ⋯)
    pause: 'Pausar', // D-339
    resume: 'Reanudar', // D-200 (de Pausado a Activo, como el selector de antes)
    terminate: 'Terminar', // D-339
    rate: 'tarifa', // muestra: "rate"
    received: 'cobrado', // muestra: "received"
    staff: 'personal', // muestra: "staff"
    margin: 'margen', // muestra: "margin"
    staffShare: (p: number) => `El personal es el ${p}% de la tarifa`, // muestra: "Staff is 42% of the rate"
    plusCode: 'Plus Code', // muestra
    contactBoth: 'Contacto principal y de emergencia', // muestra: "Main and emergency contact"
    contactMain: 'Contacto principal', // D-200
    contactEmergency: 'Contacto de emergencia', // D-200
    noContact: 'Sin contacto', // D-200
    everyDay: 'Todos los días', // D-200
    daysAWeek: (n: number) => `${n} días a la semana`, // muestra: "6 days a week"
    except: (names: string) => `sin ${names}`, // muestra: "no Wednesday"
    or: 'ni', // D-200 ("sin domingo ni miércoles")
    daysLong: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'], // D-200
    hoursPerVisit: (h: string) => `${h} h por visita`, // muestra: "4 h per visit"
    since: (d: string) => `desde ${d}`, // muestra: "since Sep 17, 2026"
    noFrequency: 'Sin frecuencia', // D-200
    contract: 'Contrato', // muestra: "Contract"
    download: 'Descargar', // muestra: "Download"
    extras: 'Extras', // muestra
    noExtras: 'Ninguno todavía', // muestra: "None yet"
    extraQuote: 'Quote de extra', // muestra: "+ Extra quote"
    scheduleTitle: 'Personal', // D-342: solo el personal asignado; el horario está en Schedule and Work
    docsEmpty: 'Todavía no hay documentos.', // D-200
    docsError: 'No se pudieron cargar los documentos. Inténtalo otra vez.', // D-200
    open: 'Abrir', // D-200
    historyEmpty: 'Todavía no hay cambios ni correos.', // D-200
    historyError: 'No se pudo cargar el historial. Inténtalo otra vez.', // D-200
    emailSent: (t: string) => `Correo enviado: ${t}`, // D-200
    statusChanged: (s: string) => `Estado: ${s}`, // D-200
    rateChanged: 'Tarifa cambiada', // D-200
    staffAssigned: 'Personal asignado', // D-200
    staffRemoved: 'Personal quitado', // D-200
    payDefined: 'Pago definido', // D-200
    scheduleChanged: 'Horario del jobsite cambiado', // D-200
    incomeGenerated: 'Ingreso del mes generado', // D-200
    incomeAdjusted: 'Ingreso ajustado', // D-200
    incomeReceived: 'Ingreso marcado como recibido', // D-200
    incomePending: 'Ingreso marcado como pendiente', // D-200
    extraIncome: 'Extra agregado al ingreso', // D-200
    cleaningType: 'Tipo de limpieza cambiado', // D-200
    contractPending: 'Contrato pendiente', // D-200
    reactivated: 'Jobsite reactivado', // D-200
    // Jobsite terminado y reactivar (orden 151, D-340 (2), muestra pantalla 3). D-200 = detalle menor.
    endedNote: (d: string, rate: string | null) =>
      rate ? `Terminó el ${d}. Era ${rate} al mes.` : `Terminó el ${d}.`, // muestra: "Terminated on Aug 31, 2026. It was $2,038.00 per month."
    approvedVisits: (n: number) => (n === 1 ? '1 visita aprobada' : `${n} visitas aprobadas`), // muestra: "15 approved visits"
    periodRange: (a: string, b: string) => `${a} – ${b}`, // muestra: "Aug 1 – Aug 31, 2026"
    periodMoney: (income: string | null, staff: string | null) =>
      [income ? `Ingresos ${income}` : null, staff ? `Personal ${staff}` : null].filter(Boolean).join(' · '), // muestra: "Income $2,038 · Staff $1,350"
    periodNote: 'Total de la cuenta', // muestra: "Total for the account"
    reactivate: 'Reactivar jobsite', // muestra: "Reactivate jobsite"
    reactivateNote: 'Pide la fecha de inicio nueva y la tarifa mensual, que empiezan con las anteriores.', // muestra
    reactivateTitle: (n: string) => `Reactivar ${n}`, // D-200
    newStart: 'Fecha de inicio', // D-200
    newRate: 'Tarifa mensual', // D-200
    reactivateBody: 'Vuelve a Activas con su fecha de inicio nueva. El historial anterior se conserva.', // muestra (texto del survey)
    confirmReactivate: 'Reactivar', // D-200
    errorStart: 'Elige hoy o una fecha posterior.', // D-200
    errorReactivate: 'No se pudo reactivar. Inténtalo otra vez.', // D-200
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
    tabActive: (n: number) => `Active · ${n}`,
    tabArchived: (n: number) => `Archived · ${n}`,
    search: 'Search client or jobsite',
    monthlyTotal: 'Monthly total',
    perMo: (m: string) => `${m} /mo`,
    staff: (n: number) => (n === 1 ? '1 staff' : `${n} staff`),
    since: (d: string) => `since ${d}`,
    terminated: 'Terminated',
    oneTime: 'One-time', // one-time project chip in Accounts
    inactiveClient: 'Inactive client',
    range: (from: string, to: string) => `${from} – ${to}`,
    ended: 'Ended',
    was: (m: string) => `was ${m}/mo`,
    noResults: 'No accounts match that search.',
    emptyArchived: 'No archived accounts.',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  client: {
    barTitle: 'Client',
    name: 'Company name',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    notes: 'Notes',
    contracts: 'Contracts',
    contractRow: (jobsite: string) => `Contract · ${jobsite}`,
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
    terminateBody: 'Visits and expected income stop and the assigned staff is closed. It can be reactivated later.',
    confirmPause: 'Pause',
    confirmTerminate: 'End',
    rateTitle: 'Monthly rate',
    rateQuoteNote: 'The rate changes with a new quote.',
  },
  detail: {
    clientLine: (n: string) => `Client: ${n}`,
    call: 'Call',
    email: 'Email',
    maps: 'Maps',
    schedule: 'Schedule',
    tabSummary: 'Summary',
    tabDocuments: 'Documents',
    tabHistory: 'History',
    menu: 'More actions',
    pause: 'Pause',
    resume: 'Resume',
    terminate: 'End',
    rate: 'rate',
    received: 'received',
    staff: 'staff',
    margin: 'margin',
    staffShare: (p: number) => `Staff is ${p}% of the rate`,
    plusCode: 'Plus Code',
    contactBoth: 'Main and emergency contact',
    contactMain: 'Main contact',
    contactEmergency: 'Emergency contact',
    noContact: 'No contact',
    everyDay: 'Every day',
    daysAWeek: (n: number) => `${n} days a week`,
    except: (names: string) => `no ${names}`,
    or: 'or',
    daysLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    hoursPerVisit: (h: string) => `${h} h per visit`,
    since: (d: string) => `since ${d}`,
    noFrequency: 'No frequency',
    contract: 'Contract',
    download: 'Download',
    extras: 'Extras',
    noExtras: 'None yet',
    extraQuote: 'Extra quote',
    scheduleTitle: 'Staff',
    docsEmpty: 'No documents yet.',
    docsError: "Couldn't load the documents. Try again.",
    open: 'Open',
    historyEmpty: 'No changes or emails yet.',
    historyError: "Couldn't load the history. Try again.",
    emailSent: (t: string) => `Email sent: ${t}`,
    statusChanged: (s: string) => `Status: ${s}`,
    rateChanged: 'Rate changed',
    staffAssigned: 'Staff assigned',
    staffRemoved: 'Staff removed',
    payDefined: 'Pay set',
    scheduleChanged: 'Jobsite schedule changed',
    incomeGenerated: 'Monthly income generated',
    incomeAdjusted: 'Income adjusted',
    incomeReceived: 'Income marked as received',
    incomePending: 'Income marked as pending',
    extraIncome: 'Extra added to income',
    cleaningType: 'Cleaning type changed',
    contractPending: 'Contract pending',
    reactivated: 'Jobsite reactivated',
    endedNote: (d: string, rate: string | null) => (rate ? `Terminated on ${d}. It was ${rate} per month.` : `Terminated on ${d}.`),
    approvedVisits: (n: number) => (n === 1 ? '1 approved visit' : `${n} approved visits`),
    periodRange: (a: string, b: string) => `${a} – ${b}`,
    periodMoney: (income: string | null, staff: string | null) =>
      [income ? `Income ${income}` : null, staff ? `Staff ${staff}` : null].filter(Boolean).join(' · '),
    periodNote: 'Total for the account',
    reactivate: 'Reactivate jobsite',
    reactivateNote: 'Asks for the new start date and the monthly rate, which start filled with the previous ones.',
    reactivateTitle: (n: string) => `Reactivate ${n}`,
    newStart: 'Start date',
    newRate: 'Monthly rate',
    reactivateBody: 'It goes back to Active with its new start date. The previous history is kept.',
    confirmReactivate: 'Reactivate',
    errorStart: 'Choose today or a later date.',
    errorReactivate: "Couldn't reactivate. Try again.",
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
