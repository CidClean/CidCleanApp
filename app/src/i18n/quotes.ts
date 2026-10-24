import type { Locale } from './index';
import type { QuoteStatus } from '@/lib/quoteRules';

/**
 * Textos del hito 4 (quote y portal del cliente). Van aparte de es.ts y en.ts para no chocar con el otro ejecutor.
 * APROBADO = sale literal de una decisión o muestra aprobada. D-208 = pantalla sin muestra diseñada por el ejecutor
 * con el sistema aprobado (el dueño la revisa en el teléfono). D-200 = detalle menor del ejecutor.
 */
export const quotesEs = {
  status: {
    draft: 'Borrador', // APROBADO (D-209)
    sent: 'Enviado', // APROBADO (D-209)
    viewed: 'Visto', // APROBADO (D-209)
    accepted: 'Aceptado', // APROBADO (D-209)
    rejected: 'Rechazado', // APROBADO (D-209)
    changes_requested: 'Cambios pedidos', // APROBADO (D-209)
    expired: 'Expirado', // APROBADO (D-209)
    superseded: 'Reemplazado', // APROBADO (D-209)
  } satisfies Record<QuoteStatus, string>,
  // Pestaña Sitios del lead
  sectionTitle: 'Quotes', // D-208
  siteQuote: (site: string) => `Quote · ${site}`, // D-208 (muestra ronda 9: "Quote · Gulf Coast Dental")
  // Quote de extra desde el jobsite (hito 7, D-238)
  extraTitle: (site: string) => `Quote de extra · ${site}`, // D-200
  newExtra: 'Nuevo quote', // APROBADO (D-238)
  extrasTitle: 'Quotes de extra', // D-200
  noExtras: 'Sin quotes de extra.', // D-200
  extraRow: (version: string) => `Extra · versión ${version}`, // D-200
  totalOnce: 'Total', // D-200
  serviceDate: 'Fecha del servicio', // D-200 (D-238)
  serviceDateNote: 'Si el cliente lo acepta, se suma al ingreso esperado del mes del servicio; sin fecha, al mes en que lo acepte.', // D-200
  errorNewExtra: 'No se pudo crear el quote. Inténtalo otra vez.', // D-200
  noQuoteYet: 'Sin quote', // D-208
  needWalkthrough: 'El quote se arma cuando el walkthrough del sitio esté cerrado.', // D-208
  version: (v: string) => `Versión ${v}`, // APROBADO (muestra ronda 4: "Versión 1.0")
  // Armado (D-077 + D-209)
  services: 'Servicios', // APROBADO (D-077)
  addons: 'Add-ons', // APROBADO (D-077)
  discounts: 'Descuentos', // APROBADO (D-077)
  taxable: 'Gravable', // APROBADO (D-077)
  subtotal: 'Subtotal', // APROBADO (D-077)
  taxOnTaxable: (rate: string) => `Tax ${rate}% sobre lo gravable`, // APROBADO (muestra ronda 9)
  total: 'Total mensual', // APROBADO (D-077)
  addService: 'Agregar servicio', // D-208
  addAddon: 'Agregar add-on', // D-208
  addDiscount: 'Agregar descuento', // D-208
  lineName: 'Nombre', // D-208
  amount: 'Monto', // APROBADO (D-100: campo Monto)
  percent: 'Porcentaje', // D-208
  discountAmount: 'Monto', // D-208
  removeLine: (name: string) => `Quitar ${name}`, // D-208 (solo lector de pantalla)
  suggestions: 'Usados antes', // D-208
  taxRate: 'Tax (%)', // D-208 (6% editable, D-006)
  validDays: 'Vigencia (días)', // D-208 (30 por defecto, editable, D-006)
  recipients: 'Destinatarios', // D-208
  contactEmail: (e: string) => `${e} · contacto del sitio`, // D-208
  noContactEmail: 'El walkthrough no tiene correo del contacto: agrega al menos un correo.', // D-208
  extraEmail: 'Agregar correo (opcional)', // D-208
  add: 'Agregar', // D-208
  removeEmail: (e: string) => `Quitar ${e}`, // D-208 (solo lector de pantalla)
  sow: 'SOW (PDF)', // D-208
  sowRequired: 'El SOW es obligatorio para enviar.', // D-208 (D-209: SOW obligatorio)
  uploadSow: 'Subir SOW (PDF)', // D-208 (patrón de "Subir PDF", D-176)
  replaceSow: 'Cambiar SOW', // D-208
  readSow: 'Leer SOW (PDF)', // APROBADO (D-041)
  viewPdf: 'Ver PDF del quote', // D-208
  preview: 'Vista previa', // D-208
  previewTitle: 'Vista previa del cliente', // D-208
  saveDraft: 'Guardar borrador', // D-208 (nombre dado en la orden 15)
  send: 'Enviar', // D-208 (nombre dado en la orden 15)
  saved: 'Borrador guardado.', // D-208
  sentOk: (n: number) => (n === 1 ? 'Enviado a 1 correo.' : `Enviado a ${n} correos.`), // D-208
  sentMailFailed: 'El quote quedó enviado, pero no salió el correo a todos. Toca Reenviar correo.', // D-208
  resend: 'Reenviar correo', // D-208
  newVersion: 'Nueva versión', // D-208 (D-007)
  renew: 'Renovar', // D-208 (D-209: renovar un vencido crea versión nueva)
  needService: 'Agrega al menos un servicio.', // D-208
  lineError: 'Escribe el nombre y el monto.', // D-208
  percentError: 'El porcentaje va de 0 a 100.', // D-208
  emailError: 'Escribe un correo válido.', // APROBADO (D-156)
  sentOn: (d: string) => `Enviado el ${d}`, // D-208
  sentBy: (who: string) => `por ${who}`, // D-208
  expiresOn: (d: string) => `Válida hasta el ${d}`, // APROBADO (muestra ronda 4)
  expiredOn: (d: string) => `Venció el ${d}`, // D-208
  viewedOn: (d: string) => `Visto el ${d}`, // D-208
  decision: 'Decisión del cliente', // D-208
  acceptedBy: (name: string, title: string) => `Aceptado por ${name}, ${title}`, // D-208
  rejectedReason: (r: string) => `Motivo: ${r}`, // D-208
  note: (n: string) => `Nota: ${n}`, // D-208
  previousVersions: 'Versiones anteriores', // D-208
  noPrices: 'Sin permiso para ver precios', // D-208
  errorLoad: 'No se pudo cargar el quote. Inténtalo otra vez.', // D-200 (patrón D-178)
  errorSave: 'No se pudo guardar. Inténtalo otra vez.', // D-200 (mismo texto que el formulario del empleado)
  errorSend: 'No se pudo enviar. Inténtalo otra vez.', // D-200 (patrón D-178)
  errorUpload: 'No se pudo subir el SOW. Inténtalo otra vez.', // D-200 (patrón D-178)
  // Ajustes: términos del portal (D-209: mismo mecanismo que los del staff)
  portalTermsRow: 'Términos del portal del cliente', // D-208
  portalTermsNote: 'Los clientes los aceptan al aceptar una cotización.', // D-208
  // Pendientes del Inicio (D-209, D-131)
  home: {
    accepted: (c: string) => `Quote aceptado: ${c}`, // D-208
    rejected: (c: string) => `Quote rechazado: ${c}`, // D-208
    changes_requested: (c: string) => `Cambios pedidos: ${c}`, // D-208
    expiring: (c: string) => `Quote por vencer: ${c}`, // D-208 (D-131)
    detail: (site: string) => site, // D-208
  },
};

export type QuoteStrings = typeof quotesEs;

export const quotesEn: QuoteStrings = {
  status: {
    draft: 'Draft',
    sent: 'Sent',
    viewed: 'Viewed',
    accepted: 'Accepted',
    rejected: 'Rejected',
    changes_requested: 'Changes requested',
    expired: 'Expired',
    superseded: 'Replaced',
  },
  sectionTitle: 'Quotes',
  siteQuote: (site: string) => `Quote · ${site}`,
  extraTitle: (site: string) => `Extra quote · ${site}`,
  newExtra: 'New quote',
  extrasTitle: 'Extra quotes',
  noExtras: 'No extra quotes.',
  extraRow: (version: string) => `Extra · version ${version}`,
  totalOnce: 'Total',
  serviceDate: 'Service date',
  serviceDateNote: "If the client accepts it, it's added to the expected income of the service month; with no date, to the month it's accepted.",
  errorNewExtra: "The quote couldn't be created. Try again.",
  noQuoteYet: 'No quote',
  needWalkthrough: "The quote is built once the site's walkthrough is closed.",
  version: (v: string) => `Version ${v}`,
  services: 'Services',
  addons: 'Add-ons',
  discounts: 'Discounts',
  taxable: 'Taxable',
  subtotal: 'Subtotal',
  taxOnTaxable: (rate: string) => `Tax ${rate}% on taxable items`,
  total: 'Monthly total',
  addService: 'Add service',
  addAddon: 'Add add-on',
  addDiscount: 'Add discount',
  lineName: 'Name',
  amount: 'Amount',
  percent: 'Percent',
  discountAmount: 'Amount',
  removeLine: (name: string) => `Remove ${name}`,
  suggestions: 'Used before',
  taxRate: 'Tax (%)',
  validDays: 'Valid for (days)',
  recipients: 'Recipients',
  contactEmail: (e: string) => `${e} · site contact`,
  noContactEmail: 'The walkthrough has no contact email: add at least one email.',
  extraEmail: 'Add email (optional)',
  add: 'Add',
  removeEmail: (e: string) => `Remove ${e}`,
  sow: 'SOW (PDF)',
  sowRequired: 'The SOW is required to send.',
  uploadSow: 'Upload SOW (PDF)',
  replaceSow: 'Change SOW',
  readSow: 'Read SOW (PDF)',
  viewPdf: 'View quote PDF',
  preview: 'Preview',
  previewTitle: 'Client preview',
  saveDraft: 'Save draft',
  send: 'Send',
  saved: 'Draft saved.',
  sentOk: (n: number) => (n === 1 ? 'Sent to 1 email.' : `Sent to ${n} emails.`),
  sentMailFailed: "The quote was sent, but the email didn't reach everyone. Tap Resend email.",
  resend: 'Resend email',
  newVersion: 'New version',
  renew: 'Renew',
  needService: 'Add at least one service.',
  lineError: 'Enter the name and the amount.',
  percentError: 'The percent goes from 0 to 100.',
  emailError: 'Enter a valid email.',
  sentOn: (d: string) => `Sent on ${d}`,
  sentBy: (who: string) => `by ${who}`,
  expiresOn: (d: string) => `Valid until ${d}`,
  expiredOn: (d: string) => `Expired on ${d}`,
  viewedOn: (d: string) => `Viewed on ${d}`,
  decision: "Client's decision",
  acceptedBy: (name: string, title: string) => `Accepted by ${name}, ${title}`,
  rejectedReason: (r: string) => `Reason: ${r}`,
  note: (n: string) => `Note: ${n}`,
  previousVersions: 'Previous versions',
  noPrices: 'No permission to see prices',
  errorLoad: "Couldn't load the quote. Try again.",
  errorSave: "Couldn't save. Try again.",
  errorSend: "Couldn't send. Try again.",
  errorUpload: "Couldn't upload the SOW. Try again.",
  portalTermsRow: 'Client portal terms',
  portalTermsNote: 'Clients accept them when they accept a quote.',
  home: {
    accepted: (c: string) => `Quote accepted: ${c}`,
    rejected: (c: string) => `Quote rejected: ${c}`,
    changes_requested: (c: string) => `Changes requested: ${c}`,
    expiring: (c: string) => `Quote expiring: ${c}`,
    detail: (site: string) => site,
  },
};

export function getQuoteStrings(locale: Locale): QuoteStrings {
  return locale === 'es' ? quotesEs : quotesEn;
}

/** Portal del cliente, en el idioma del lead (D-209). Textos de la muestra de la ronda 4 donde existen. */
export const portalEs = {
  brand: 'Cid Clean', // APROBADO
  yourQuote: 'Tu cotización', // APROBADO (muestra ronda 4)
  emailTitle: 'Entra con tu correo', // APROBADO (D-149, mismo mecanismo que el staff)
  emailNote: 'Escribe el correo al que llegó la cotización y te enviaremos un código.', // D-208
  email: 'Correo', // APROBADO (muestra ronda 13)
  sendCode: 'Enviar código', // APROBADO (D-149)
  codeTitle: 'Escribe tu código', // APROBADO (muestra ronda 4)
  codeNote: 'Si tu correo recibió la cotización, te llegará un código de 6 dígitos. Vale 10 minutos.', // D-208 (patrón D-150)
  resend: 'Reenviar código', // APROBADO (D-150, D-163)
  wrongCode: 'El código es incorrecto o ya venció. Revisa tu correo e inténtalo otra vez.', // APROBADO (D-156)
  locked: 'Demasiados intentos. Pide un código nuevo.', // D-208 (D-209)
  rateLimited: 'Pediste demasiados códigos. Espera un momento e inténtalo otra vez.', // APROBADO (D-156)
  invalidEmail: 'Escribe un correo válido.', // APROBADO (D-156)
  network: 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.', // D-208 (patrón D-156)
  monthly: 'Cuota mensual', // APROBADO (muestra ronda 4)
  validUntil: (d: string) => `Válida hasta el ${d}`, // APROBADO (muestra ronda 4)
  services: 'Servicios', // APROBADO (D-077)
  addons: 'Add-ons', // APROBADO (D-077)
  discounts: 'Descuentos', // APROBADO (D-077)
  subtotal: 'Subtotal', // APROBADO (muestra ronda 4)
  tax: (rate: string) => `Tax ${rate}%`, // APROBADO (muestra ronda 4)
  total: 'Total mensual', // APROBADO (muestra ronda 4)
  // Quote de extra (D-238): un servicio de una vez, no una cuota mensual.
  extraFee: 'Total del servicio', // D-200
  totalOnce: 'Total', // D-200
  serviceDate: (d: string) => `Fecha del servicio: ${d}`, // D-200
  frequency: 'Frecuencia', // D-208
  site: 'Sitio', // APROBADO (muestra ronda 4)
  version: 'Versión', // APROBADO (muestra ronda 4)
  readSow: 'Leer SOW (PDF)', // APROBADO (D-041)
  downloadQuote: 'Descargar cotización (PDF)', // D-208 (flujo: el cliente puede descargar el quote)
  sowLocked: 'Abre el SOW para poder continuar', // APROBADO (D-042)
  continue: 'Continuar', // APROBADO (D-042)
  decisionTitle: 'Tu decisión', // APROBADO (muestra ronda 4)
  totalWithTax: 'Total mensual con tax', // APROBADO (muestra ronda 4)
  accept: 'Aceptar cotización', // APROBADO (D-044)
  moreOptions: 'Más opciones', // APROBADO (D-044, solo lector de pantalla)
  negotiate: 'Negociar', // APROBADO (D-094)
  negotiateHint: 'Pedir cambios al precio o al alcance', // APROBADO (D-094)
  reject: 'Rechazar', // APROBADO (D-094)
  rejectHint: 'No aceptar la cotización', // APROBADO (D-094)
  fullName: 'Nombre completo', // APROBADO (D-045)
  jobTitle: 'Cargo', // APROBADO (D-045)
  confirmRead: 'Confirmo que leí el SOW y acepto los términos', // APROBADO (D-045)
  confirmReadSowOnly: 'Confirmo que leí el SOW', // D-208 (D-209: sin términos publicados, solo el SOW)
  readTerms: 'Leer los términos', // D-208
  rejectTitle: 'Rechazar cotización', // APROBADO (muestra ronda 4)
  negotiateTitle: 'Pedir cambios', // D-208
  whichReason: '¿Cuál es el motivo?', // APROBADO (muestra ronda 4)
  noteOptional: 'Nota (opcional)', // APROBADO (muestra ronda 4)
  submit: 'Enviar', // APROBADO (muestra ronda 4)
  needReason: 'Elige un motivo.', // D-208
  needReasonOrNote: 'Elige un motivo o escribe una nota.', // D-208
  needNameTitle: 'Escribe tu nombre y tu cargo.', // D-208
  needConfirm: 'Marca la casilla para aceptar.', // D-208
  acceptedTitle: 'Cotización aceptada', // APROBADO (muestra ronda 4)
  acceptedAt: 'Aceptada', // APROBADO (muestra ronda 4)
  by: 'Por', // APROBADO (muestra ronda 4)
  rejectedTitle: 'Cotización rechazada', // D-208
  rejectedBody: 'Gracias por avisarnos. Guardamos tu respuesta.', // D-208
  changesTitle: 'Recibimos tu solicitud', // APROBADO (D-209)
  changesBody: 'Te enviaremos una versión nueva de la cotización.', // D-208
  expiredTitle: 'Esta cotización venció', // D-208
  expiredBody: 'Escríbenos para recibir una versión nueva.', // D-208
  supersededTitle: 'Hay una versión más nueva', // D-208
  supersededBody: 'Te la enviamos por correo. Abre el enlace del correo más reciente.', // D-208
  decidedTitle: 'Esta cotización ya tiene una respuesta', // D-208
  decidedBody: 'Si necesitas algo más, responde al correo de la cotización.', // D-208
  notFoundTitle: 'Enlace no válido', // D-208
  notFoundBody: 'Revisa que el enlace sea el del correo de la cotización.', // D-208
  home: 'Abre el enlace del correo de tu cotización.', // D-208 (raíz de quote.cidclean.com)
  error: 'Algo salió mal. Inténtalo otra vez.', // D-208
};

export type PortalStrings = typeof portalEs;

export const portalEn: PortalStrings = {
  brand: 'Cid Clean',
  yourQuote: 'Your quote',
  emailTitle: 'Sign in with your email',
  emailNote: "Enter the email the quote was sent to and we'll send you a code.",
  email: 'Email',
  sendCode: 'Send code',
  codeTitle: 'Enter your code',
  codeNote: "If your email received the quote, you'll get a 6-digit code. It's valid for 10 minutes.",
  resend: 'Resend code',
  wrongCode: 'The code is incorrect or has expired. Check your email and try again.',
  locked: 'Too many attempts. Request a new code.',
  rateLimited: "You've requested too many codes. Wait a moment and try again.",
  invalidEmail: 'Enter a valid email.',
  network: "We couldn't connect. Check your connection and try again.",
  monthly: 'Monthly fee',
  validUntil: (d: string) => `Valid until ${d}`,
  services: 'Services',
  addons: 'Add-ons',
  discounts: 'Discounts',
  subtotal: 'Subtotal',
  tax: (rate: string) => `Tax ${rate}%`,
  total: 'Monthly total',
  extraFee: 'Service total',
  totalOnce: 'Total',
  serviceDate: (d: string) => `Service date: ${d}`,
  frequency: 'Frequency',
  site: 'Site',
  version: 'Version',
  readSow: 'Read SOW (PDF)',
  downloadQuote: 'Download quote (PDF)',
  sowLocked: 'Open the SOW to continue',
  continue: 'Continue',
  decisionTitle: 'Your decision',
  totalWithTax: 'Monthly total with tax',
  accept: 'Accept quote',
  moreOptions: 'More options',
  negotiate: 'Negotiate',
  negotiateHint: 'Request changes to the price or scope',
  reject: 'Reject',
  rejectHint: "Don't accept the quote",
  fullName: 'Full name',
  jobTitle: 'Job title',
  confirmRead: 'I confirm I read the SOW and accept the terms',
  confirmReadSowOnly: 'I confirm I read the SOW',
  readTerms: 'Read the terms',
  rejectTitle: 'Reject quote',
  negotiateTitle: 'Request changes',
  whichReason: "What's the reason?",
  noteOptional: 'Note (optional)',
  submit: 'Send',
  needReason: 'Choose a reason.',
  needReasonOrNote: 'Choose a reason or write a note.',
  needNameTitle: 'Enter your name and job title.',
  needConfirm: 'Check the box to accept.',
  acceptedTitle: 'Quote accepted',
  acceptedAt: 'Accepted',
  by: 'By',
  rejectedTitle: 'Quote rejected',
  rejectedBody: 'Thanks for letting us know. We saved your answer.',
  changesTitle: 'We received your request',
  changesBody: "We'll send you a new version of the quote.",
  expiredTitle: 'This quote has expired',
  expiredBody: 'Write to us to receive a new version.',
  supersededTitle: "There's a newer version",
  supersededBody: 'We emailed it to you. Open the link in the most recent email.',
  decidedTitle: 'This quote already has an answer',
  decidedBody: 'If you need anything else, reply to the quote email.',
  notFoundTitle: 'Invalid link',
  notFoundBody: 'Check that the link is the one in the quote email.',
  home: 'Open the link in your quote email.',
  error: 'Something went wrong. Try again.',
};

export function getPortalStrings(l: 'es' | 'en'): PortalStrings {
  return l === 'es' ? portalEs : portalEn;
}
