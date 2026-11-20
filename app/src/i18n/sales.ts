import type { Locale } from './index';

/**
 * Textos de Ventas A (hito 2): Pipeline, leads, sitios, walkthrough agendado, lead perdido y pendientes del Inicio.
 * Van aparte de es.ts y en.ts para no chocar con el trabajo del otro ejecutor; se pueden unir al integrar.
 * APROBADO = sale literal de una decisión o muestra aprobada. D-200 = detalle menor decidido por el ejecutor
 * (listado en el reporte del hito 2 para registrarlo).
 */
/** "hace 8 días" (D-200: hoy y 1 día). */
const ago = (n: number) => (n <= 0 ? 'hoy' : n === 1 ? 'hace 1 día' : `hace ${n} días`);
const agoEn = (n: number) => (n <= 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`);

export const salesEs = {
  status: {
    new: 'Nuevo', // APROBADO (flujo, D-071)
    waiting: 'Esperando respuesta', // APROBADO (D-333, survey flujo-leads-aprobado)
    follow_up: 'Follow up', // APROBADO (D-333)
    follow_up_2: '2nd follow up', // APROBADO (D-333)
    no_response: 'Sin respuesta', // APROBADO (D-333)
    interested: 'Interesado', // APROBADO (D-333)
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
    ads: 'Anuncio', // D-200 (D-347: anuncios de Meta y TikTok)
    agent: 'Agente de IA', // D-200 (D-347: Muse, Grok u otro agente)
  },

  // Origen y tipo del lead (D-348 a D-350, survey leads-fuentes-aprobado; el survey está en inglés, aquí su traducción).
  origin: {
    all: 'Todos', // D-200 (D-350: "All")
    potential: 'Potencial', // D-200 (D-350: "Potential")
    cold: 'En frío', // D-200 (D-350: "Cold")
    filterCount: (label: string, n: number) => `${label} · ${n}`, // APROBADO (D-350: "Potential · N")
    call: 'Llamar', // D-200 (D-350: "Call")
    website: 'Website', // D-200 (D-348)
    recurring: 'Recurrente', // D-200 (D-350: "Recurring")
    oneTime: 'One-time', // APROBADO (D-349)
    oneTimeResidential: 'One-time · Residencial', // D-200 (D-350: "One-time · Residential")
    service: 'Servicio', // D-200 (D-350: "Service")
    property: 'Propiedad', // D-200 (D-350: "Property")
    commercial: 'Comercial', // D-200 (D-350: "Commercial")
    residential: 'Residencial', // D-200 (D-350: "Residential")
    companyOptional: 'Empresa (opcional)', // D-200 (D-350: "Company (optional)")
    errorContact: 'Escribe el nombre de la persona.', // D-200 (sin empresa, el lead se nombra por la persona)
  },

  list: {
    empty: 'Todavía no hay leads.', // D-200
    errorLoad: 'No se pudieron cargar los leads. Inténtalo otra vez.', // D-200 (mismo estilo de D-195)
    noPermission: 'No tienes permiso para ver leads.', // D-200 (mismo estilo de D-194)
    walkthroughOn: (when: string) => `Walkthrough: ${when}`, // D-200 (muestra ronda 1: "Mar 22 oct · 10:00 AM")
    followUpOn: (when: string) => `Seguimiento: ${when}`, // D-200
    // D-226 (muestra surveys/estilo-c1-pantallas/Pipeline.html).
    kicker: 'Ventas', // APROBADO (D-226)
    open: 'Abiertos', // APROBADO (D-226)
    quoteSent: 'Quote enviado', // APROBADO (D-226)
    won: 'Ganados', // APROBADO (D-226)
    all: 'Todos', // APROBADO (D-226)
    followUpToday: 'Seguimiento hoy', // APROBADO (D-226)
    withWalkthrough: 'Walkthrough', // APROBADO (D-226)
    noMatch: 'Ningún lead con este filtro.', // D-200
  },

  form: {
    newTitle: 'Nuevo lead', // D-200 (mismo patrón de "Nuevo empleado", D-171)
    company: 'Empresa', // APROBADO (flujo: datos del lead)
    contact: 'Persona de contacto', // APROBADO (flujo)
    language: 'Idioma del cliente', // D-200, hito 4: idioma del correo y del portal del quote (D-209)
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
    companyMissing: 'Completa la empresa', // D-200 (D-319: el sitio web no trajo empresa)
    tabData: 'Datos', // APROBADO (D-070)
    tabSites: 'Sitios', // APROBADO (D-070, D-220)
    tabWalkthrough: 'Walkthrough', // APROBADO (D-220)
    tabQuote: 'Quote', // APROBADO (D-220)
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
    deleteLead: 'Eliminar lead', // APROBADO (D-201)
    deleteTitle: (company: string) => `¿Eliminar ${company}?`, // APROBADO (D-201)
    deleteBody: 'Se borran también sus sitios, citas y seguimientos.', // D-200
    delete: 'Eliminar', // APROBADO (D-201)
    errorDelete: 'No se pudo eliminar el lead. Inténtalo otra vez.', // D-200 (mismo estilo de D-195)
    // D-226 (muestra surveys/estilo-c1-pantallas/Lead.html).
    call: 'Llamar', // APROBADO (D-226)
    mail: 'Correo', // APROBADO (D-226)
    statusButton: (status: string) => `Estado: ${status}`, // APROBADO (D-226)
    sitesCount: (n: number) => (n === 1 ? '1 sitio' : `${n} sitios`), // APROBADO (D-226: "2 sitios")
    noQuote: 'Sin quote todavía', // APROBADO (D-226)
  },

  // Orden 101 (N2): envíos del sitio con el correo de un lead abierto. Textos D-200.
  siteRequests: {
    title: 'Solicitudes del sitio', // D-200
    unverified: 'Sin verificar', // D-200
    unverifiedNote: 'Cualquiera puede escribir este correo en el sitio. Confirma con el cliente antes de actuar.', // D-200
    estimate: 'Estimado', // D-200
    contact: 'Mensaje', // D-200
    size: (sqft: string) => `${sqft} sq ft`, // D-200
    range: (low: string, high: string) => `${low} – ${high} al mes`, // D-200
    noCustomerMail: 'No se le mandó el correo al cliente (tope por hora).', // D-200
    errorLoad: 'No se pudieron cargar las solicitudes del sitio. Inténtalo otra vez.', // D-200 (mismo estilo de D-195)
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
    editTitle: 'Editar sitio', // D-200 (D-202: el lápiz abre el formulario del sitio)
    editLabel: (site: string) => `Editar ${site}`, // D-200: solo lo lee el lector de pantalla
    deleteLabel: (site: string) => `Eliminar ${site}`, // D-200: solo lo lee el lector de pantalla
    deleteTitle: (site: string) => `¿Eliminar ${site}?`, // APROBADO (orden H2b, D-202)
    errorDone: 'Este sitio ya tiene un walkthrough hecho y no se puede eliminar.', // D-200 (D-202)
    errorDelete: 'No se pudo eliminar el sitio. Inténtalo otra vez.', // D-200 (mismo estilo de D-195)
    errorLoad: 'No se pudo cargar el sitio. Inténtalo otra vez.', // D-200
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
    errorTime: 'Elige la hora.', // D-216 (delegado D-200): la hora ya no se escribe
    errorPast: 'Elige una fecha y hora futuras.', // D-200
    errorSchedule: 'No se pudo agendar. Inténtalo otra vez.', // D-200 (mismo estilo de D-195)
    weekDays: ['D', 'L', 'M', 'X', 'J', 'V', 'S'], // APROBADO (muestras ronda 8 y 12); D-231: desde domingo
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

  // Menú → Ajustes → Motivos de lead perdido (D-107, D-113, D-114, D-203).
  reasons: {
    row: 'Motivos de lead perdido', // APROBADO (D-107)
    count: (n: number) => (n === 1 ? '1 motivo' : `${n} motivos`), // D-200 (D-107: "con la cantidad de motivos")
    add: 'Agregar', // APROBADO (orden H2b, D-113)
    newTitle: 'Nuevo motivo', // D-200
    editTitle: 'Editar motivo', // D-200
    labelEs: 'En español', // D-200
    labelEn: 'En inglés', // D-200
    errorEs: 'Escribe el motivo en español.', // D-200
    errorEn: 'Escribe el motivo en inglés.', // D-200
    errorLoad: 'No se pudieron cargar los motivos. Inténtalo otra vez.', // D-200
    errorSave: 'No se pudo guardar. Inténtalo otra vez.', // APROBADO (D-195)
    errorDelete: 'No se pudo eliminar el motivo. Inténtalo otra vez.', // D-200
    deleteTitle: (reason: string) => `¿Eliminar ${reason}?`, // D-200 (mismo patrón de D-201 y D-202)
    deactivated: 'Algún lead ya usa este motivo: se quitó de la lista y esos leads lo conservan.', // D-200
    editLabel: (reason: string) => `Editar ${reason}`, // D-200: solo lo lee el lector de pantalla
    deleteLabel: (reason: string) => `Eliminar ${reason}`, // D-200: solo lo lee el lector de pantalla
  },

  // Flujo de leads automático (D-332, D-333; surveys/flujo-leads-aprobado.html).
  flow: {
    title: 'Leads', // APROBADO (survey flujo-leads-aprobado)
    tabs: { today: 'Hoy', toContact: 'Por contactar', waiting: 'Esperando', sale: 'En venta', closed: 'Cerrados' }, // APROBADO (D-333 (5))
    write: 'Escribir', // APROBADO (D-333)
    responded: 'Respondió', // APROBADO (D-332 (3))
    noContact: 'Sin contacto todavía', // APROBADO (survey)
    firstContactAgo: (n: number) => `1er contacto ${ago(n)}`, // APROBADO (survey: "1er contacto hace 8 días")
    followUpAgo: (n: number) => `follow up ${ago(n)}`, // APROBADO (survey: "follow up hace 22 días")
    followUp2Ago: (n: number) => `2nd follow up ${ago(n)}`, // D-200 (mismo patrón)
    emptyTab: 'Nada en esta pestaña.', // D-200
    respondedTitle: (company: string) => `¿${company} respondió?`, // D-200
    respondedBody: 'Pasa a Interesado y se detienen los seguimientos.', // D-200 (D-333 (2))
    respondedYes: 'Sí, respondió', // D-200
    errorAction: 'No se pudo guardar. Inténtalo otra vez.', // APROBADO (D-195)
    markLost: 'Marcar perdido (Sin respuesta)', // APROBADO (orden 130, D-333 (1): Perdido o reintentar)
    retry: 'Reintentar', // APROBADO (D-333 (1))
    lostTitle: (company: string) => `¿Marcar ${company} como perdido?`, // D-200
    lostBody: 'Queda en Perdido con el motivo Sin respuesta.', // D-200
    retryTitle: (company: string) => `¿Reintentar con ${company}?`, // D-200
    retryBody: 'Vuelve a Follow up: te toca escribir hoy.', // D-200
    noResponseNote: 'Terminaron los seguimientos sin respuesta: decide.', // D-200
    changeStatus: 'Cambiar estado', // APROBADO (D-333 (3))
    timeline: 'Seguimiento', // APROBADO (survey)
    dayMonth: (day: number, month: string) => `${day} ${month}`, // D-200 (como las fechas cortas, D-038)
    tlFirst: 'Primer contacto (correo)', // APROBADO (survey)
    tlFollowUp: 'Follow up (correo)', // APROBADO (survey)
    tlFollowUp2: '2nd follow up (correo)', // D-200 (mismo patrón)
    tlResponded: 'Respondió', // D-200
    tlNextFollowUp: 'Toca follow up', // D-200 (survey: "Toca 2nd follow up")
    tlNextFollowUp2: 'Toca 2nd follow up', // APROBADO (survey)
    tlNextNoResponse: 'Sin respuesta si no contesta', // D-200
    tlNoResponse: 'Sin respuesta', // APROBADO (D-333)
    tlEmpty: 'Sin contacto todavía', // APROBADO (survey)
    homeToWrite: 'Hoy te toca escribir', // APROBADO (D-333 (4))
    homeToWriteCount: (n: number) => (n === 1 ? '1 lead' : `${n} leads`), // APROBADO (survey: "6 leads")
    homeSee: 'Ver', // APROBADO (survey)
    homeWaiting: 'Esperando respuesta', // APROBADO (D-333 (4))
    homeWaitingDetail: 'Nadie te debe nada todavía', // APROBADO (survey)
    homeNoResponse: 'Sin respuesta · decide', // APROBADO (D-333 (4))
    homeNoResponseDetail: 'Terminaron los seguimientos', // APROBADO (survey)
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
    waiting: 'Waiting for reply', // lead status: first email sent, no reply yet
    follow_up: 'Follow up', // lead status: time to send the follow-up email
    follow_up_2: '2nd follow up', // lead status: time to send the final follow-up
    no_response: 'No response', // lead status: follow-ups finished without a reply
    interested: 'Interested', // lead status: replied, now in the sale
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
    ads: 'Ad', // lead source: Meta or TikTok lead ads
    agent: 'AI agent', // lead source: Muse, Grok or another agent
  },

  origin: {
    all: 'All', // D-350 leads filter
    potential: 'Potential', // D-350 label
    cold: 'Cold', // D-350 label
    filterCount: (label: string, n: number) => `${label} · ${n}`,
    call: 'Call', // D-350 main action of a potential lead
    website: 'Website', // source chip for website leads
    recurring: 'Recurring', // D-350 chip
    oneTime: 'One-time',
    oneTimeResidential: 'One-time · Residential', // D-350 chip
    service: 'Service',
    property: 'Property',
    commercial: 'Commercial',
    residential: 'Residential',
    companyOptional: 'Company (optional)',
    errorContact: "Enter the person's name.",
  },

  list: {
    empty: 'No leads yet.', // Pipeline: empty list
    errorLoad: "Couldn't load the leads. Try again.", // Pipeline: red notice
    noPermission: "You don't have permission to see leads.", // Pipeline: person with a Sales permission but not leads_ver
    walkthroughOn: (when: string) => `Walkthrough: ${when}`, // Pipeline row detail
    followUpOn: (when: string) => `Follow-up: ${when}`, // Pipeline row detail
    kicker: 'Sales',
    open: 'Open',
    quoteSent: 'Quote sent',
    won: 'Won',
    all: 'All',
    followUpToday: 'Follow-up today',
    withWalkthrough: 'Walkthrough',
    noMatch: 'No leads match this filter.',
  },

  form: {
    newTitle: 'New lead', // create lead screen title
    company: 'Company',
    contact: 'Contact person',
    language: 'Client language', // language of the quote email and portal
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
    companyMissing: 'Complete the company', // D-200 (D-319)
    tabData: 'Details',
    tabSites: 'Sites',
    tabWalkthrough: 'Walkthrough',
    tabQuote: 'Quote',
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
    deleteLead: 'Delete lead', // Details tab: red text button at the end
    deleteTitle: (company: string) => `Delete ${company}?`, // confirmation sheet title
    deleteBody: 'Its sites, appointments and follow-ups are deleted too.',
    delete: 'Delete', // solid button of the sheet
    errorDelete: "Couldn't delete the lead. Try again.",
    call: 'Call',
    mail: 'Email',
    statusButton: (status: string) => `Status: ${status}`,
    sitesCount: (n: number) => (n === 1 ? '1 site' : `${n} sites`),
    noQuote: 'No quote yet',
  },

  siteRequests: {
    title: 'Website requests', // Notes: block with website submissions for an open lead
    unverified: 'Unverified',
    unverifiedNote: 'Anyone can type this email on the website. Check with the customer before acting on it.',
    estimate: 'Estimate',
    contact: 'Message',
    size: (sqft: string) => `${sqft} sq ft`,
    range: (low: string, high: string) => `${low} – ${high} per month`,
    noCustomerMail: 'The customer email was not sent (hourly limit).',
    errorLoad: "Couldn't load the website requests. Try again.",
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
    editTitle: 'Edit site',
    editLabel: (site: string) => `Edit ${site}`,
    deleteLabel: (site: string) => `Delete ${site}`,
    deleteTitle: (site: string) => `Delete ${site}?`,
    errorDone: 'This site already has a completed walkthrough and cannot be deleted.',
    errorDelete: "Couldn't delete the site. Try again.",
    errorLoad: "Couldn't load the site. Try again.",
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
    errorTime: 'Choose a time.',
    errorPast: 'Choose a future date and time.',
    errorSchedule: "Couldn't schedule. Try again.",
    weekDays: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
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

  reasons: {
    row: 'Lost lead reasons', // Settings row and screen title
    count: (n: number) => (n === 1 ? '1 reason' : `${n} reasons`),
    add: 'Add', // outline button under the list
    newTitle: 'New reason',
    editTitle: 'Edit reason',
    labelEs: 'In Spanish',
    labelEn: 'In English',
    errorEs: 'Enter the reason in Spanish.',
    errorEn: 'Enter the reason in English.',
    errorLoad: "Couldn't load the reasons. Try again.",
    errorSave: "Couldn't save. Try again.",
    errorDelete: "Couldn't delete the reason. Try again.",
    deleteTitle: (reason: string) => `Delete ${reason}?`,
    deactivated: 'A lead already uses this reason: it was removed from the list and those leads keep it.',
    editLabel: (reason: string) => `Edit ${reason}`,
    deleteLabel: (reason: string) => `Delete ${reason}`,
  },

  flow: {
    title: 'Leads', // leads list title
    tabs: { today: 'Today', toContact: 'To contact', waiting: 'Waiting', sale: 'In sale', closed: 'Closed' },
    write: 'Write', // row button: opens the email preview with the step's template
    responded: 'Replied', // row button: the lead answered, stops follow-ups
    noContact: 'Not contacted yet',
    firstContactAgo: (n: number) => `1st contact ${agoEn(n)}`,
    followUpAgo: (n: number) => `follow up ${agoEn(n)}`,
    followUp2Ago: (n: number) => `2nd follow up ${agoEn(n)}`,
    emptyTab: 'Nothing in this tab.',
    respondedTitle: (company: string) => `Did ${company} reply?`,
    respondedBody: 'It moves to Interested and the follow-ups stop.',
    respondedYes: 'Yes, they replied',
    errorAction: "Couldn't save. Try again.",
    markLost: 'Mark lost (No response)',
    retry: 'Try again',
    lostTitle: (company: string) => `Mark ${company} as lost?`,
    lostBody: 'It goes to Lost with the reason No response.',
    retryTitle: (company: string) => `Try again with ${company}?`,
    retryBody: "It goes back to Follow up: it's your turn to write today.",
    noResponseNote: 'Follow-ups ended without a reply: decide.',
    changeStatus: 'Change status', // lead menu: manual correction only
    timeline: 'Follow-up',
    dayMonth: (day: number, month: string) => `${month} ${day}`,
    tlFirst: 'First contact (email)',
    tlFollowUp: 'Follow up (email)',
    tlFollowUp2: '2nd follow up (email)',
    tlResponded: 'Replied',
    tlNextFollowUp: 'Follow up due',
    tlNextFollowUp2: '2nd follow up due',
    tlNextNoResponse: 'No response if no reply',
    tlNoResponse: 'No response',
    tlEmpty: 'Not contacted yet',
    homeToWrite: 'Your turn to write today', // admin home card
    homeToWriteCount: (n: number) => (n === 1 ? '1 lead' : `${n} leads`),
    homeSee: 'View',
    homeWaiting: 'Waiting for reply',
    homeWaitingDetail: 'Nobody owes you a reply yet',
    homeNoResponse: 'No response · decide',
    homeNoResponseDetail: 'Follow-ups ended',
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
