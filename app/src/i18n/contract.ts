import { useSession } from '@/lib/session';

/**
 * Contrato del cliente (D-283), diseño aprobado D-289 (surveys/contrato-cliente-aprobado.html). "APROBADO (D-289)"
 * marca los textos de la muestra; los demás son D-200. El portal del cliente va solo en inglés (D-289 (2)).
 */

const es = {
  title: 'Contrato', // D-200
  status: {
    pending: 'Contrato pendiente', // APROBADO (D-289)
    client_signed: 'Firmado por el cliente', // APROBADO (D-289)
    both_signed: 'Firmado por ambas partes', // APROBADO (D-289)
    needs_update: 'Requiere actualización', // APROBADO (D-283)
  },
  steps: ['Aceptado', 'Contrato enviado', 'Firmado por el cliente', 'Firmado por ambas partes'], // APROBADO (D-289)
  acceptedBy: (date: string, name: string, title: string | null) => `Aceptado · ${date} por ${name}${title ? ` (${title})` : ''}`, // APROBADO (D-289)
  sentTo: (date: string, email: string) => `Contrato enviado · ${date} a ${email}`, // D-200
  priceHeld: (date: string) => `El precio se mantiene hasta ${date} (15 días). Después pasa a "Requiere actualización".`, // APROBADO (D-289)
  needsUpdate: 'Pasaron 15 días sin la firma del cliente. Envía una versión nueva del quote.', // D-200 (D-283)
  prepare: 'Preparar contrato', // APROBADO (D-289)
  prepareNote: 'Lo demás sale del quote, del walkthrough y del cliente.', // APROBADO (D-289)
  viewPdf: 'Ver PDF', // APROBADO (D-289)
  sendForSignature: 'Enviar para firma', // APROBADO (D-289)
  resend: 'Reenviar para firma', // D-200
  sent: (email: string) => `Contrato enviado a ${email}.`, // D-200
  mailFailed: 'El contrato quedó listo, pero el correo no salió. Toca Reenviar para firma.', // D-200
  missing: 'Completa los campos vacíos antes de enviar.', // D-200
  signedBy: (name: string, date: string, time: string) => `${name} firmó el ${date} a las ${time}.`, // APROBADO (D-289)
  viewSignedPdf: 'Ver PDF firmado', // APROBADO (D-289)
  countersign: 'Contrafirmar', // APROBADO (D-289)
  countersignConfirm: 'Vas a firmar el contrato en nombre de Cid Clean. Se envía una copia al cliente y a info@cidclean.com.', // D-200
  cancel: 'Cancelar', // D-200
  copySent: (name: string) => `Copia enviada a ${name} y a info@cidclean.com.`, // APROBADO (D-289)
  viewContract: 'Ver contrato', // D-200
  error: 'No se pudo completar. Inténtalo otra vez.', // D-200
  close: 'Cerrar', // D-200
  cleaningType: 'Tipo de limpieza', // APROBADO (D-289)
  nonResidential: 'No residencial', // APROBADO (D-289)
  residential: 'Residencial', // APROBADO (D-289)
  residentialNote: 'Residencial no lleva el 6% de Florida.', // APROBADO (D-289)
  noContractTitle: 'Sin contrato firmado.', // APROBADO (D-289)
  noContract: 'No se pueden programar visitas de este jobsite hasta que el contrato esté firmado por ambas partes.', // APROBADO (D-289)
  fields: {
    start_date: 'Fecha de inicio del servicio', // APROBADO (D-289)
    area_sqft: 'Área aproximada (sq ft)', // APROBADO (D-289)
    service_window: 'Franja de acceso del cliente', // APROBADO (D-289)
    date: 'Fecha del SOW',
    effective_date: 'Fecha de vigencia del contrato',
    client_company: 'Cliente (nombre legal) en el SOW',
    client_legal_name: 'Nombre legal del cliente',
    client_entity: 'Tipo de entidad y estado',
    client_address: 'Dirección legal del cliente',
    client_contact: 'Contacto del cliente (nombre, cargo, correo, teléfono)',
    client_email: 'Correo del cliente para avisos',
    site_address: 'Dirección del sitio',
    floors_rooms: 'Pisos / áreas',
    facility_type: 'Tipo de instalación',
    walkthrough_date: 'Fecha del walkthrough',
    frequency: 'Frecuencia',
    holidays: 'Feriados sin servicio',
    a3_offices_area: 'A3 · Área: oficinas', a3_offices_freq: 'A3 · Frecuencia: oficinas',
    a3_restrooms_area: 'A3 · Área: baños', a3_restrooms_freq: 'A3 · Frecuencia: baños',
    a3_breakroom_area: 'A3 · Área: cocina', a3_breakroom_freq: 'A3 · Frecuencia: cocina',
    a3_floors_area: 'A3 · Área: pisos duros', a3_floors_freq: 'A3 · Frecuencia: pisos duros',
    a3_entrances_area: 'A3 · Área: entradas', a3_entrances_freq: 'A3 · Frecuencia: entradas',
    a3_periodic_area: 'A3 · Área: periódicas', a3_periodic_task: 'A3 · Tareas periódicas', a3_periodic_freq: 'A3 · Frecuencia: periódicas',
    a3_addons_area: 'A3 · Área: add-ons', a3_addons_task: 'A3 · Add-ons', a3_addons_freq: 'A3 · Frecuencia: add-ons',
    supplies_cc: 'Lo que pone Cid Clean',
    supplies_client: 'Lo que pone el cliente',
    storage: 'Lugar para guardar los materiales',
    access_method: 'Forma de acceso (llaves, fob, código, alarma)',
    keys_count: 'Llaves o fobs entregados',
    restricted_areas: 'Áreas restringidas',
    inspections: 'Inspecciones de calidad',
    price: 'Precio',
    a9_name: 'A9 · Nombre', a9_title: 'A9 · Cargo', a9_datetime: 'A9 · Fecha y hora',
    cc_title: 'Cargo de quien firma por Cid Clean',
  } as Record<string, string>,
};

export type ContractStrings = typeof es;

const en: ContractStrings = {
  title: 'Contract',
  status: { pending: 'Contract pending', client_signed: 'Signed by the client', both_signed: 'Signed by both parties', needs_update: 'Needs update' },
  steps: ['Accepted', 'Contract sent', 'Signed by the client', 'Signed by both parties'],
  acceptedBy: (date, name, title) => `Accepted · ${date} by ${name}${title ? ` (${title})` : ''}`,
  sentTo: (date, email) => `Contract sent · ${date} to ${email}`,
  priceHeld: (date) => `The price holds until ${date} (15 days). After that it becomes "Needs update".`,
  needsUpdate: '15 days went by without the client signing. Send a new quote version.',
  prepare: 'Prepare contract',
  prepareNote: 'Everything else comes from the quote, the walkthrough and the client.',
  viewPdf: 'View PDF',
  sendForSignature: 'Send for signature',
  resend: 'Resend for signature',
  sent: (email) => `Contract sent to ${email}.`,
  mailFailed: "The contract is ready, but the email didn't go out. Tap Resend for signature.",
  missing: 'Fill in the empty fields before sending.',
  signedBy: (name, date, time) => `${name} signed on ${date} at ${time}.`,
  viewSignedPdf: 'View signed PDF',
  countersign: 'Countersign',
  countersignConfirm: "You're signing the contract for Cid Clean. A copy goes to the client and to info@cidclean.com.",
  cancel: 'Cancel',
  copySent: (name) => `Copy sent to ${name} and to info@cidclean.com.`,
  viewContract: 'View contract',
  error: "Couldn't finish. Try again.",
  close: 'Close',
  cleaningType: 'Cleaning type',
  nonResidential: 'Non-residential',
  residential: 'Residential',
  residentialNote: "Residential doesn't carry Florida's 6%.",
  noContractTitle: 'No signed contract.',
  noContract: "Visits for this jobsite can't be scheduled until the contract is signed by both parties.",
  fields: {
    start_date: 'Service start date', area_sqft: 'Approx. area (sq ft)', service_window: 'Client access window',
    date: 'SOW date', effective_date: 'Agreement effective date', client_company: 'Client (legal name) on the SOW',
    client_legal_name: 'Client legal name', client_entity: 'Entity type and state', client_address: 'Client legal address',
    client_contact: 'Client contact (name, title, email, phone)', client_email: 'Client email for notices',
    site_address: 'Site address', floors_rooms: 'Floors / rooms', facility_type: 'Facility type',
    walkthrough_date: 'Walkthrough date', frequency: 'Frequency', holidays: 'Holidays not serviced',
    a3_offices_area: 'A3 · Area: offices', a3_offices_freq: 'A3 · Frequency: offices',
    a3_restrooms_area: 'A3 · Area: restrooms', a3_restrooms_freq: 'A3 · Frequency: restrooms',
    a3_breakroom_area: 'A3 · Area: break room', a3_breakroom_freq: 'A3 · Frequency: break room',
    a3_floors_area: 'A3 · Area: hard floors', a3_floors_freq: 'A3 · Frequency: hard floors',
    a3_entrances_area: 'A3 · Area: entrances', a3_entrances_freq: 'A3 · Frequency: entrances',
    a3_periodic_area: 'A3 · Area: periodic', a3_periodic_task: 'A3 · Periodic tasks', a3_periodic_freq: 'A3 · Frequency: periodic',
    a3_addons_area: 'A3 · Area: add-ons', a3_addons_task: 'A3 · Add-ons', a3_addons_freq: 'A3 · Frequency: add-ons',
    supplies_cc: 'Cid Clean provides', supplies_client: 'Client provides', storage: 'On-site storage',
    access_method: 'Access method (keys, fob, code, alarm)', keys_count: 'Keys or fobs issued', restricted_areas: 'Restricted areas',
    inspections: 'Quality inspections', price: 'Price', a9_name: 'A9 · Name', a9_title: 'A9 · Title', a9_datetime: 'A9 · Date/time',
    cc_title: 'Title of the Cid Clean signer',
  },
};

export const getContractStrings = (l: 'es' | 'en'): ContractStrings => (l === 'es' ? es : en);
export function useContractStrings(): ContractStrings {
  return getContractStrings(useSession().locale);
}

/** Portal de firma del cliente, solo en inglés (D-289 (2)). */
export const CONTRACT_PORTAL = {
  brand: 'Cid Clean',
  title: 'Commercial Service Agreement', // APROBADO (D-289)
  readPdf: 'Read the agreement and SOW (PDF)', // APROBADO (D-289)
  fullName: 'Full name', // APROBADO (D-289)
  jobTitle: 'Title', // APROBADO (D-289)
  sign: 'Sign agreement', // APROBADO (D-289)
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
  needNameTitle: 'Enter your full name and title.',
  needAgree: 'Check the box to sign electronically.',
  doneTitle: 'Agreement signed',
  doneBody: "Thank you. Cid Clean will countersign it and email you a signed copy with the e-signature certificate.",
  signedTitle: 'This agreement is already signed',
  signedBody: 'Cid Clean will email you the copy signed by both parties.',
  expiredTitle: 'This link expired',
  expiredBody: 'Ask Cid Clean to send the agreement again: info@cidclean.com · (786) 250-1324.',
  notFoundTitle: "We couldn't find this agreement",
  notFoundBody: 'Make sure it is the link from the Cid Clean email.',
};
