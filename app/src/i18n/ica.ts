import { useSession } from '@/lib/session';

/**
 * Fase D: ICA, ofertas de trabajo y advertencias (D-285; ICA opcional sin bloqueo, D-292). Diseño aprobado en
 * surveys/ica-ofertas-aprobado.html: "APROBADO (D-292)" marca los textos de la muestra; los demás son D-200. El portal
 * del contratista va solo en inglés, como el ICA (D-285).
 */

const es = {
  // Documentos del 1099
  icaTitle: 'Contrato de contratista (ICA)', // APROBADO (D-292)
  noIca: 'Sin ICA', // APROBADO (D-292)
  noIcaDetail: 'Sin ICA (acuerdo verbal)', // APROBADO (D-292)
  status: {
    draft: 'Borrador', // D-200
    sent: 'Enviado', // APROBADO (D-292)
    contractor_signed: 'Firmado por el contratista', // D-200
    signed: 'Firmado por ambas partes', // D-200 (como el contrato del cliente, D-289)
  } as Record<string, string>,
  sentOn: (ica: string, date: string) => `${ica} · enviado el ${date}`, // APROBADO (D-292)
  draftDetail: (ica: string) => `${ica} · borrador`, // D-200
  signedByOn: (ica: string, name: string, date: string) => `${ica} · ${name} firmó el ${date}`, // D-200
  signedOn: (ica: string, date: string) => `${ica} · firmado el ${date}`, // D-200
  uploadedOn: (ica: string, date: string, by: string | null) => `${ica} · subido el ${date}${by ? ` por ${by}` : ''} (papel)`, // D-200
  sentNote: 'Cuando firme, aparece "Contrafirmar". También puedes "Subir ICA firmado" si lo firmó en papel.', // APROBADO (D-292)
  prepare: 'Preparar ICA', // APROBADO (D-292)
  prepareNote: 'Los datos salen del perfil y del W-9. Revísalos antes de enviar.', // D-200
  viewPdf: 'Ver PDF', // APROBADO (D-292)
  sendForSignature: 'Enviar para firma', // D-200 (como el contrato del cliente, D-289)
  resend: 'Reenviar para firma', // D-200
  countersign: 'Contrafirmar', // APROBADO (D-292)
  countersignConfirm: 'Vas a firmar el ICA en nombre de Cid Clean. Se envía una copia al contratista y a info@cidclean.com.', // D-200
  uploadSigned: 'Subir ICA firmado', // APROBADO (D-292)
  viewSigned: 'Ver ICA firmado', // D-200
  onlySuperAdmin: 'Solo el Super Admin lo prepara y lo abre.', // D-200
  missing: 'Completa este campo antes de enviar.', // D-200
  mailFailed: 'El ICA quedó listo, pero el correo no salió. Toca Reenviar para firma.', // D-200
  fields: {
    contractor_name: 'Nombre legal o de negocio', business_name: 'Nombre del negocio (si tiene)', contractor_entity: 'Tipo (individual o entidad)',
    contractor_address: 'Dirección', contractor_email: 'Correo', contractor_phone: 'Teléfono', effective_date: 'Fecha de efecto (MM/DD/YYYY)',
    sched_site_1: 'Anexo A · Sitio 1', sched_rate_1: 'Anexo A · Tarifa por día 1', sched_site_2: 'Anexo A · Sitio 2',
    sched_rate_2: 'Anexo A · Tarifa por día 2', cc_title: 'Cargo de quien firma por Cid Clean',
  } as Record<string, string>, // D-200

  // Ofertas (admin)
  offerTitle: (name: string) => `Ofrecer trabajo a ${name}`, // APROBADO (D-292)
  offerNote: (site: string, from: string, to: string, freq: string, rate: string) =>
    `${site} · Franja de acceso: ${from} – ${to} · ${freq} · ${rate} por día`, // APROBADO (D-292)
  jobsite: 'Jobsite', // D-200
  ratePerDay: 'Pago por día', // D-200
  startDate: 'Desde', // D-200
  visit: 'Visita', // D-200
  oneVisit: 'Visita puntual', // APROBADO (D-292)
  wholeJobsite: 'Todo el jobsite', // D-200
  offer: 'Ofrecer', // APROBADO (D-292)
  offered: 'Oferta enviada.', // D-200
  noVisits: 'Este jobsite no tiene visitas próximas.', // D-200
  noJobsites: 'No hay jobsites activos con contrato firmado.', // D-200
  offersTitle: 'Ofertas', // APROBADO (D-292)
  noOffers: 'Todavía no hay ofertas.', // D-200
  offerStatus: { pending: 'Pendiente', accepted: 'Aceptada', declined: 'Rechazada', withdrawn: 'Retirada' } as Record<string, string>, // APROBADO (D-292; Rechazada y Retirada D-200)
  sentOnShort: (site: string, date: string) => `${site} · enviada ${date}`, // APROBADO (D-292)
  oneVisitOn: (date: string) => `Visita puntual ${date}`, // APROBADO (D-292)
  noAccess: 'Sin acceso', // APROBADO (D-292)
  registerAnswer: 'Registrar respuesta', // APROBADO (D-292)
  registerTitle: (name: string) => `Respuesta de ${name}`, // D-200
  registerNote: 'No tiene acceso a la app: registra lo que te dijo.', // D-200
  accepted: 'Aceptó', // D-200
  declined: 'Rechazó', // D-200
  withdraw: 'Retirar oferta', // D-200

  // Oferta del 1099
  newOffer: 'Nueva oferta de trabajo', // APROBADO (D-292)
  offerDetail: (site: string, from: string, to: string, freq: string, rate: string) =>
    `${site} · Franja de acceso del cliente ${from} – ${to} · ${freq} · ${rate} por día de servicio`, // APROBADO (D-292)
  daysPerWeek: (n: number) => (n === 1 ? '1 día por semana' : `${n} días por semana`), // APROBADO (D-292)
  everyDay: '7 días por semana', // D-200
  onDay: (date: string) => `el ${date}`, // D-200
  accept: 'Aceptar', // APROBADO (D-292)
  decline: 'Rechazar', // APROBADO (D-292)
  noConsequence: 'Puedes aceptar o rechazar sin ninguna consecuencia.', // APROBADO (D-292)
  acceptedDone: 'Aceptaste la oferta. Ya aparece en tu horario.', // D-200
  declinedDone: 'Rechazaste la oferta.', // D-200

  // Advertencias
  warningsTitle: 'Advertencias escritas', // APROBADO (D-292)
  countOf3: (n: number) => `${n} de 3`, // APROBADO (D-292)
  active: 'Vigente', // APROBADO (D-292)
  voided: 'Anulada', // D-200
  withPdf: 'PDF', // APROBADO (D-292)
  noWarnings: 'Sin advertencias.', // D-200
  newWarning: 'Nueva advertencia', // APROBADO (D-292)
  date: 'Fecha', // D-200
  reason: 'Motivo', // D-200
  attach: 'Adjuntar documento (opcional)', // D-200
  attached: 'Documento adjunto', // D-200
  save: 'Guardar', // D-200
  voidAction: 'Anular', // D-200
  voidTitle: 'Anular advertencia', // D-200
  voidReason: 'Motivo de la anulación', // D-200
  amberBefore: 'Al llegar a 3 te avisamos para revisar si corresponde terminar el contrato por escrito.', // APROBADO (D-292)
  amberAt3: (name: string, n: number) => `${name} tiene ${n} advertencias escritas. Revisa si corresponde terminar el contrato por escrito.`, // D-200 (D-285)
  reasonRequired: 'Escribe el motivo.', // D-200

  cancel: 'Cancelar', // D-200
  error: 'No se pudo completar. Inténtalo otra vez.', // D-200
  days: ['L', 'M', 'Mi', 'J', 'V', 'S', 'D'], // D-200 (lunes en 0, como la frecuencia)
};

export type IcaStrings = typeof es;

const en: IcaStrings = {
  icaTitle: 'Independent contractor agreement (ICA)',
  noIca: 'No ICA',
  noIcaDetail: 'No ICA (verbal agreement)',
  status: { draft: 'Draft', sent: 'Sent', contractor_signed: 'Signed by the contractor', signed: 'Signed by both parties' },
  sentOn: (ica, date) => `${ica} · sent on ${date}`,
  draftDetail: (ica) => `${ica} · draft`,
  signedByOn: (ica, name, date) => `${ica} · ${name} signed on ${date}`,
  signedOn: (ica, date) => `${ica} · signed on ${date}`,
  uploadedOn: (ica, date, by) => `${ica} · uploaded on ${date}${by ? ` by ${by}` : ''} (paper)`,
  sentNote: 'When they sign, "Countersign" appears. You can also "Upload signed ICA" if they signed on paper.',
  prepare: 'Prepare ICA',
  prepareNote: 'The details come from the profile and the W-9. Check them before sending.',
  viewPdf: 'View PDF',
  sendForSignature: 'Send for signature',
  resend: 'Resend for signature',
  countersign: 'Countersign',
  countersignConfirm: "You're signing the ICA for Cid Clean. A copy goes to the contractor and to info@cidclean.com.",
  uploadSigned: 'Upload signed ICA',
  viewSigned: 'View signed ICA',
  onlySuperAdmin: 'Only the Super Admin prepares and opens it.',
  missing: 'Fill in this field before sending.',
  mailFailed: "The ICA is ready, but the email didn't go out. Tap Resend for signature.",
  fields: {
    contractor_name: 'Legal or business name', business_name: 'Business name (if any)', contractor_entity: 'Type (individual or entity)',
    contractor_address: 'Address', contractor_email: 'Email', contractor_phone: 'Phone', effective_date: 'Effective date (MM/DD/YYYY)',
    sched_site_1: 'Schedule A · Site 1', sched_rate_1: 'Schedule A · Rate per day 1', sched_site_2: 'Schedule A · Site 2',
    sched_rate_2: 'Schedule A · Rate per day 2', cc_title: 'Title of the Cid Clean signer',
  },
  offerTitle: (name) => `Offer work to ${name}`,
  offerNote: (site, from, to, freq, rate) => `${site} · Access window: ${from} – ${to} · ${freq} · ${rate} per day`,
  jobsite: 'Jobsite',
  ratePerDay: 'Pay per day',
  startDate: 'From',
  visit: 'Visit',
  oneVisit: 'One-time visit',
  wholeJobsite: 'Whole jobsite',
  offer: 'Offer',
  offered: 'Offer sent.',
  noVisits: 'This jobsite has no upcoming visits.',
  noJobsites: 'There are no active jobsites with a signed contract.',
  offersTitle: 'Offers',
  noOffers: 'No offers yet.',
  offerStatus: { pending: 'Pending', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn' },
  sentOnShort: (site, date) => `${site} · sent ${date}`,
  oneVisitOn: (date) => `One-time visit ${date}`,
  noAccess: 'No access',
  registerAnswer: 'Record answer',
  registerTitle: (name) => `${name}'s answer`,
  registerNote: "They don't have app access: record what they told you.",
  accepted: 'Accepted',
  declined: 'Declined',
  withdraw: 'Withdraw offer',
  newOffer: 'New job offer',
  offerDetail: (site, from, to, freq, rate) => `${site} · Client access window ${from} – ${to} · ${freq} · ${rate} per service day`,
  daysPerWeek: (n) => (n === 1 ? '1 day per week' : `${n} days per week`),
  everyDay: '7 days per week',
  onDay: (date) => `on ${date}`,
  accept: 'Accept',
  decline: 'Decline',
  noConsequence: 'You can accept or decline with no consequence.',
  acceptedDone: 'You accepted the offer. It now shows in your schedule.',
  declinedDone: 'You declined the offer.',
  warningsTitle: 'Written warnings',
  countOf3: (n) => `${n} of 3`,
  active: 'Active',
  voided: 'Voided',
  withPdf: 'PDF',
  noWarnings: 'No warnings.',
  newWarning: 'New warning',
  date: 'Date',
  reason: 'Reason',
  attach: 'Attach a document (optional)',
  attached: 'Document attached',
  save: 'Save',
  voidAction: 'Void',
  voidTitle: 'Void warning',
  voidReason: 'Reason for voiding',
  amberBefore: "When they reach 3, we'll let you know so you can review whether to end the agreement in writing.",
  amberAt3: (name, n) => `${name} has ${n} written warnings. Review whether to end the agreement in writing.`,
  reasonRequired: 'Write the reason.',
  cancel: 'Cancel',
  error: "Couldn't finish. Try again.",
  days: ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'],
};

export const getIcaStrings = (l: 'es' | 'en'): IcaStrings => (l === 'es' ? es : en);
export function useIcaStrings(): IcaStrings {
  return getIcaStrings(useSession().locale);
}

/** Portal de firma del ICA, solo en inglés (D-285). */
export const ICA_PORTAL = {
  brand: 'Cid Clean',
  title: 'Independent Contractor Agreement',
  readPdf: 'Read the agreement (PDF)',
  fullName: 'Full name',
  sign: 'Sign agreement',
  loading: 'Loading',
  back: 'Back',
  emailTitle: 'Sign in with your email',
  emailNote: "Enter the email where you got the agreement and we'll send you a code.",
  email: 'Email',
  sendCode: 'Send code',
  codeTitle: 'Enter your code',
  codeNote: "If it's your email, you'll get a 6-digit code. It's valid for 10 minutes.",
  resendCode: 'Resend code',
  wrongCode: 'The code is wrong or expired. Check your email and try again.',
  locked: 'Too many attempts. Ask for a new code.',
  rateLimited: 'You asked for too many codes. Wait a moment and try again.',
  invalidEmail: 'Enter a valid email.',
  network: 'No connection. Check your internet and try again.',
  error: 'Something went wrong. Try again.',
  needName: 'Enter your full name.',
  needAgree: 'Check the box to sign electronically.',
  doneTitle: 'Agreement signed',
  doneBody: 'Thank you. Cid Clean will countersign it and email you a signed copy with the e-signature certificate.',
  signedTitle: 'This agreement is already signed',
  signedBody: 'Cid Clean will email you the copy signed by both parties.',
  expiredTitle: 'This link expired',
  expiredBody: 'Ask Cid Clean to send the agreement again: info@cidclean.com · (786) 250-1324.',
  notFoundTitle: "We couldn't find this agreement",
  notFoundBody: 'Make sure it is the link from the Cid Clean email.',
};
