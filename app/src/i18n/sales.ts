import type { Locale } from './index';

/**
 * Textos de Ventas A (hito 2): Pipeline, leads, sitios, walkthrough agendado, lead perdido y pendientes del Inicio.
 * Van aparte de es.ts y en.ts para no chocar con el trabajo del otro ejecutor; se pueden unir al integrar.
 * APROBADO = sale literal de una decisión o muestra aprobada. D-200 = detalle menor decidido por el ejecutor
 * (listado en el reporte del hito 2 para registrarlo).
 */
export const salesEs = {
  status: {
    new: 'Nuevo', // APROBADO (flujo, D-071)
    contacted: 'Contactado', // APROBADO (flujo, D-071)
    walkthrough_scheduled: 'Walkthrough agendado', // APROBADO (flujo, D-071)
    walkthrough_done: 'Walkthrough hecho', // APROBADO (flujo, D-071)
    quote_sent: 'Quote enviado', // APROBADO (flujo, D-071)
    negotiation: 'Negociación', // APROBADO (flujo, D-071)
    won: 'Ganado', // APROBADO (flujo, D-071)
    lost: 'Perdido', // APROBADO (flujo, D-071)
  },
  source: {
    web: 'Web', // APROBADO (flujo: fuentes web, campañas y registro manual)
    campaign: 'Campaña', // APROBADO (flujo)
    manual: 'Manual', // APROBADO (flujo)
  },

  list: {
    empty: 'Todavía no hay leads.', // D-200
    errorLoad: 'No se pudieron cargar los leads. Inténtalo otra vez.', // D-200 (mismo estilo de D-195)
    noPermission: 'No tienes permiso para ver leads.', // D-200 (mismo estilo de D-194)
    walkthroughOn: (when: string) => `Walkthrough: ${when}`, // D-200 (muestra ronda 1: "Mar 22 oct · 10:00 AM")
    followUpOn: (when: string) => `Seguimiento: ${when}`, // D-200
  },

  form: {
    newTitle: 'Nuevo lead', // D-200 (mismo patrón de "Nuevo empleado", D-171)
    company: 'Empresa', // APROBADO (flujo: datos del lead)
    contact: 'Persona de contacto', // APROBADO (flujo)
    phone: 'Teléfono', // APROBADO (muestra ronda 8)
    email: 'Email', // APROBADO (muestra ronda 8)
    source: 'Fuente', // APROBADO (flujo)
    followUp: 'Fecha de seguimiento (opcional)', // D-200
    followUpPlaceholder: 'MM/DD/AAAA', // D-200
    notes: 'Notas', // APROBADO (flujo, D-070)
    create: 'Crear lead', // D-200 (mismo patrón de "Crear empleado", D-171)
    errorCompany: 'Escribe el nombre de la empresa.', // D-200 (mismo estilo de "Escribe el nombre.", D-195)
    errorEmail: 'Escribe un correo válido.', // APROBADO (D-156)
    errorDate: 'Escribe una fecha válida, por ejemplo 10/24/2026.', // D-200
    errorCreate: 'No se pudo crear el lead. Inténtalo otra vez.', // D-200 (mismo estilo de D-195)
    errorForbidden: 'No tienes permiso para crear leads.', // D-200 (mismo estilo de D-195)
    errorSave: 'No se pudo guardar. Inténtalo otra vez.', // APROBADO (D-195)
  },

  detail: {
    barTitle: 'Lead', // APROBADO (muestra ronda 8)
    sourceLine: (source: string) => `Lead · Fuente: ${source.toLowerCase()}`, // APROBADO (muestra ronda 8: "Lead · Fuente: web")
    tabData: 'Datos', // APROBADO (D-070)
    tabSites: 'Sitios', // APROBADO (D-070)
    tabNotes: 'Notas', // APROBADO (D-070)
    contact: 'Contacto', // APROBADO (muestra ronda 8)
    phone: 'Teléfono', // APROBADO (muestra ronda 8)
    email: 'Email', // APROBADO (muestra ronda 8)
    followUp: 'Seguimiento', // D-200
    none: '—', // D-200 (mismo signo que el perfil del empleado)
    status: 'Estado', // APROBADO (D-071)
    lostReason: 'Motivo', // APROBADO (D-079)
    lostNote: 'Nota', // D-200
    noNotes: 'Sin notas.', // D-200
    errorLoad: 'No se pudo cargar el lead. Inténtalo otra vez.', // D-200 (mismo estilo de D-195)
    errorStatus: 'No se pudo cambiar el estado. Inténtalo otra vez.', // APROBADO (D-195)
  },

  sites: {
    add: 'Agregar sitio', // D-200
    schedule: 'Agendar walkthrough', // APROBADO (muestra ronda 1)
    needSite: 'Agrega un sitio para agendar el walkthrough.', // D-200
    empty: 'Este lead todavía no tiene sitios.', // D-200
    walkthroughOn: (when: string) => `Walkthrough: ${when}`, // D-200
    noWalkthrough: 'Sin walkthrough agendado', // D-200
    newTitle: 'Nuevo sitio', // D-200
    name: 'Nombre del sitio (opcional)', // D-200
    address: 'Dirección', // APROBADO (flujo: sitio y contacto)
    errorAddress: 'Escribe la dirección.', // D-200
    errorAdd: 'No se pudo agregar el sitio. Inténtalo otra vez.', // D-200
  },

  schedule: {
    title: 'Agendar walkthrough', // APROBADO (muestra ronda 9 y 12)
    site: 'Sitio', // APROBADO (muestra ronda 9)
    afterSite: 'Después, el calendario y la hora', // APROBADO (muestra ronda 9)
    continue: 'Continuar', // APROBADO (muestra ronda 9)
    time: 'Hora', // APROBADO (D-072)
    timePlaceholder: '10:00 AM', // APROBADO (muestra ronda 8)
    submit: 'Agendar', // APROBADO (D-072)
    previousMonth: 'Mes anterior', // D-200: solo lo lee el lector de pantalla
    nextMonth: 'Mes siguiente', // D-200: solo lo lee el lector de pantalla
    errorTime: 'Escribe una hora válida, por ejemplo 10:00 AM.', // D-200
    errorPast: 'Elige una fecha y hora futuras.', // D-200
    errorSchedule: 'No se pudo agendar. Inténtalo otra vez.', // D-200 (mismo estilo de D-195)
    weekDays: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], // APROBADO (muestras ronda 8 y 12)
    months: [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ], // APROBADO (muestra ronda 12: "Octubre 2026")
  },

  lost: {
    title: 'Marcar como perdido', // APROBADO (muestra ronda 9)
    reason: 'Motivo', // APROBADO (D-079)
    note: 'Nota (opcional)', // APROBADO (muestra ronda 9)
    submit: 'Marcar como perdido', // APROBADO (D-079)
    errorLoad: 'No se pudieron cargar los motivos. Inténtalo otra vez.', // D-200
    errorSave: 'No se pudo marcar como perdido. Inténtalo otra vez.', // D-200
  },

  home: {
    urgent: 'Urgente', // APROBADO (D-111, D-131)
    followUps: 'Seguimientos de leads', // APROBADO (muestras ronda 9 y 12)
    followUpsDetail: (n: number) => (n === 1 ? '1 pendiente' : `${n} pendientes`), // APROBADO (muestra ronda 12: "3 pendientes")
    walkthroughs: 'Walkthroughs agendados', // D-200
    walkthroughsDetail: (n: number) => (n === 1 ? '1 agendado' : `${n} agendados`), // D-200
  },

  // Fechas cortas de las listas: "Mar 22 oct" (muestra ronda 1).
  dayNames: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'], // APROBADO (D-038, muestra ronda 1)
  monthShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], // APROBADO (muestra ronda 1)
  shortDate: (dayName: string, day: number, month: string) => `${dayName} ${day} ${month}`,
};

export type SalesStrings = typeof salesEs;

/** English (D-157): translated with the screen and purpose of each text; not yet reviewed by the owner. */
export const salesEn: SalesStrings = {
  status: {
    new: 'New', // lead status
    contacted: 'Contacted',
    walkthrough_scheduled: 'Walkthrough scheduled',
    walkthrough_done: 'Walkthrough done',
    quote_sent: 'Quote sent',
    negotiation: 'Negotiation',
    won: 'Won',
    lost: 'Lost',
  },
  source: {
    web: 'Web', // lead source: website form
    campaign: 'Campaign', // lead source: marketing campaign
    manual: 'Manual', // lead source: entered by hand
  },

  list: {
    empty: 'No leads yet.', // Pipeline: empty list
    errorLoad: "Couldn't load the leads. Try again.", // Pipeline: red notice
    noPermission: "You don't have permission to see leads.", // Pipeline: person with a Sales permission but not leads_ver
    walkthroughOn: (when: string) => `Walkthrough: ${when}`, // Pipeline row detail
    followUpOn: (when: string) => `Follow-up: ${when}`, // Pipeline row detail
  },

  form: {
    newTitle: 'New lead', // create lead screen title
    company: 'Company',
    contact: 'Contact person',
    phone: 'Phone',
    email: 'Email',
    source: 'Source',
    followUp: 'Follow-up date (optional)',
    followUpPlaceholder: 'MM/DD/YYYY',
    notes: 'Notes',
    create: 'Create lead', // solid button
    errorCompany: 'Enter the company name.',
    errorEmail: 'Enter a valid email.',
    errorDate: 'Enter a valid date, for example 10/24/2026.',
    errorCreate: "Couldn't create the lead. Try again.",
    errorForbidden: "You don't have permission to create leads.",
    errorSave: "Couldn't save. Try again.",
  },

  detail: {
    barTitle: 'Lead', // lead detail: top bar title
    sourceLine: (source: string) => `Lead · Source: ${source.toLowerCase()}`, // lead detail header
    tabData: 'Details',
    tabSites: 'Sites',
    tabNotes: 'Notes',
    contact: 'Contact',
    phone: 'Phone',
    email: 'Email',
    followUp: 'Follow-up',
    none: '—',
    status: 'Status', // status dropdown label
    lostReason: 'Reason',
    lostNote: 'Note',
    noNotes: 'No notes.',
    errorLoad: "Couldn't load the lead. Try again.",
    errorStatus: "Couldn't change the status. Try again.",
  },

  sites: {
    add: 'Add site', // Sites tab: outline button
    schedule: 'Schedule walkthrough', // Sites tab: solid button
    needSite: 'Add a site to schedule the walkthrough.',
    empty: "This lead doesn't have any sites yet.",
    walkthroughOn: (when: string) => `Walkthrough: ${when}`,
    noWalkthrough: 'No walkthrough scheduled',
    newTitle: 'New site',
    name: 'Site name (optional)',
    address: 'Address',
    errorAddress: 'Enter the address.',
    errorAdd: "Couldn't add the site. Try again.",
  },

  schedule: {
    title: 'Schedule walkthrough',
    site: 'Site',
    afterSite: 'Next, the calendar and the time',
    continue: 'Continue',
    time: 'Time',
    timePlaceholder: '10:00 AM',
    submit: 'Schedule',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    errorTime: 'Enter a valid time, for example 10:00 AM.',
    errorPast: 'Choose a future date and time.',
    errorSchedule: "Couldn't schedule. Try again.",
    weekDays: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
    months: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
  },

  lost: {
    title: 'Mark as lost',
    reason: 'Reason',
    note: 'Note (optional)',
    submit: 'Mark as lost',
    errorLoad: "Couldn't load the reasons. Try again.",
    errorSave: "Couldn't mark the lead as lost. Try again.",
  },

  home: {
    urgent: 'Urgent', // admin home: amber chip of an urgent pending item
    followUps: 'Lead follow-ups', // admin home: pending row
    followUpsDetail: (n: number) => (n === 1 ? '1 pending' : `${n} pending`),
    walkthroughs: 'Scheduled walkthroughs',
    walkthroughsDetail: (n: number) => (n === 1 ? '1 scheduled' : `${n} scheduled`),
  },

  dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  monthShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  shortDate: (dayName: string, day: number, month: string) => `${dayName}, ${month} ${day}`,
};

export function getSalesStrings(locale: Locale): SalesStrings {
  return locale === 'es' ? salesEs : salesEn;
}
