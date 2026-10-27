import type { Locale } from './index';

/**
 * Textos del W-9 prellenado (D-255, D-256, D-257, D-258). APROBADO = de la muestra surveys/w9-aprobado.html o de una
 * decisión; D-200 = detalle delegado al arquitecto. Las opciones de la línea 3a van con los nombres del formulario
 * oficial (D-257, w9Rules.CLASSIFICATION_LABELS).
 */

/** En el perfil del empleado 1099 (idioma de la app). */
export const w9AdminEs = {
  sendToFill: 'Enviar W-9 para llenar', // APROBADO (orden 43)
  dialogTitle: (name: string) => `Enviar W-9 a ${name}`, // APROBADO (muestra: "Enviar W-9 a Karina")
  line1: 'Línea 1 · Nombre', // APROBADO (muestra, en español)
  line2: 'Línea 2 · Nombre del negocio (opcional)', // APROBADO (muestra, en español)
  line3a: 'Línea 3a · Clasificación fiscal', // APROBADO (muestra, en español)
  llcLetter: 'Clasificación del LLC', // D-200 (D-257)
  llcC: 'C = C corporation', // formulario oficial
  llcS: 'S = S corporation', // formulario oficial
  llcP: 'P = Partnership', // formulario oficial
  otherText: 'Otra: escribe cuál', // D-200 (D-257)
  line5: 'Línea 5 · Dirección (número, calle y apto. o suite)', // D-200 (muestra "Lines 5–6", el formulario las separa)
  line6: 'Línea 6 · Ciudad, estado y ZIP', // D-200
  moreOptions: 'Más opciones (opcional)', // APROBADO (D-258)
  line3b: 'Línea 3b · Tiene socios, dueños o beneficiarios extranjeros', // D-200 (D-258)
  exemptPayee: 'Línea 4 · Exempt payee code (si aplica)', // D-200 (D-258)
  fatca: 'Línea 4 · Código de exención de FATCA (si aplica)', // D-200 (D-258)
  accounts: 'Línea 7 · Números de cuenta (opcional)', // D-200 (D-258)
  sendTo: 'Enviar a', // APROBADO (muestra)
  send: 'Enviar', // APROBADO (muestra)
  cancel: 'Cancelar', // APROBADO
  sentStatus: (d: string) => `Enviado · vence ${d}`, // APROBADO (orden 43)
  expiredStatus: (d: string) => `Venció el ${d}`, // D-200
  resend: 'Reenviar', // APROBADO (orden 43)
  resent: 'Link reenviado. Vence en 7 días.', // D-200
  sentTo: (email: string) => `W-9 enviado a ${email}.`, // D-200
  mailFailed: 'El W-9 quedó listo, pero el correo no salió. Toca Reenviar.', // D-200
  changed: (list: string) => `Cambió: ${list}`, // APROBADO (orden 43)
  fields: { name: 'nombre', business: 'negocio', classification: 'clasificación', address: 'dirección' }, // D-200
  needName: 'Escribe el nombre.', // D-200
  needLlc: 'Elige la clasificación del LLC.', // D-200
  needOther: 'Escribe la clasificación (hasta 60 letras).', // D-200
  needAddress: 'Escribe la dirección.', // D-200
  needCity: 'Escribe ciudad, estado y ZIP.', // D-200
  badExempt: 'El exempt payee code va del 1 al 13.', // D-200 (instrucciones del IRS)
  badFatca: 'El código FATCA es una letra de la A a la M.', // D-200 (instrucciones del IRS)
  tooLong: 'Algún dato es muy largo.', // D-200
  invalidEmail: 'Escribe un correo válido.', // APROBADO (D-156)
  errorSend: 'No pudimos enviar el W-9. Inténtalo otra vez.', // D-200
};

export type W9AdminStrings = typeof w9AdminEs;

export const w9AdminEn: W9AdminStrings = {
  sendToFill: 'Send W-9 to fill',
  dialogTitle: (name) => `Send W-9 to ${name}`,
  line1: 'Line 1 · Name',
  line2: 'Line 2 · Business name (optional)',
  line3a: 'Line 3a · Tax classification',
  llcLetter: 'LLC tax classification',
  llcC: 'C = C corporation',
  llcS: 'S = S corporation',
  llcP: 'P = Partnership',
  otherText: 'Other: describe it',
  line5: 'Line 5 · Address (number, street, and apt. or suite)',
  line6: 'Line 6 · City, state, and ZIP code',
  moreOptions: 'More options (optional)',
  line3b: 'Line 3b · Has foreign partners, owners, or beneficiaries',
  exemptPayee: 'Line 4 · Exempt payee code (if any)',
  fatca: 'Line 4 · FATCA exemption code (if any)',
  accounts: 'Line 7 · List account number(s) (optional)',
  sendTo: 'Send to',
  send: 'Send',
  cancel: 'Cancel',
  sentStatus: (d) => `Sent · expires ${d}`,
  expiredStatus: (d) => `Expired ${d}`,
  resend: 'Resend',
  resent: 'Link resent. It expires in 7 days.',
  sentTo: (email) => `W-9 sent to ${email}.`,
  mailFailed: "The W-9 is ready, but the email didn't go out. Tap Resend.",
  changed: (list) => `Changed: ${list}`,
  fields: { name: 'name', business: 'business', classification: 'classification', address: 'address' },
  needName: 'Enter the name.',
  needLlc: 'Choose the LLC tax classification.',
  needOther: 'Enter the classification (up to 60 characters).',
  needAddress: 'Enter the address.',
  needCity: 'Enter city, state, and ZIP code.',
  badExempt: 'The exempt payee code goes from 1 to 13.',
  badFatca: 'The FATCA code is one letter from A to M.',
  tooLong: 'Something is too long.',
  invalidEmail: 'Enter a valid email.',
  errorSend: "We couldn't send the W-9. Try again.",
};

export function getW9AdminStrings(locale: Locale): W9AdminStrings {
  return locale === 'es' ? w9AdminEs : w9AdminEn;
}

/** Certificación de la Parte II tal como el formulario oficial (Rev. March 2024): siempre en inglés (D-200). */
export const CERTIFICATION_EN = [
  'Under penalties of perjury, I certify that:',
  '1. The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and',
  '2. I am not subject to backup withholding because (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and',
  '3. I am a U.S. citizen or other U.S. person (defined below); and',
  '4. The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.',
  'Certification instructions. You must cross out item 2 above if you have been notified by the IRS that you are currently subject to backup withholding because you have failed to report all interest and dividends on your tax return. For real estate transactions, item 2 does not apply. For mortgage interest paid, acquisition or abandonment of secured property, cancellation of debt, contributions to an individual retirement arrangement (IRA), and, generally, payments other than interest and dividends, you are not required to sign the certification, but you must provide your correct TIN. See the instructions for Part II, later.',
] as const;

/** Traducción de ayuda (no es el texto legal), debajo del inglés cuando el portal va en español (D-200). */
export const CERTIFICATION_ES_HELP = [
  'Bajo pena de perjurio, certifico que:',
  '1. El número de este formulario es mi número de identificación de contribuyente correcto (o estoy esperando que me asignen uno); y',
  '2. No estoy sujeto a retención adicional (backup withholding) porque (a) estoy exento, o (b) el IRS no me ha notificado que estoy sujeto a retención adicional por no declarar todos los intereses o dividendos, o (c) el IRS me notificó que ya no estoy sujeto a retención adicional; y',
  '3. Soy ciudadano estadounidense u otra persona de EE. UU.; y',
  '4. Los códigos FATCA de este formulario (si hay) que indican que estoy exento de reportar bajo FATCA son correctos.',
  'Instrucciones: debes tachar el punto 2 si el IRS te notificó que estás sujeto a retención adicional por no declarar todos los intereses y dividendos en tu declaración. Para pagos que no son intereses ni dividendos no es obligatorio firmar la certificación, pero sí dar tu TIN correcto.',
] as const;

/** Pantallas del portal, en el idioma del perfil del empleado (D-256). */
export const w9PortalEs = {
  brand: 'Cid Clean', // APROBADO
  yourW9: 'Tu W-9', // APROBADO (muestra, "Your W-9")
  emailTitle: 'Entra con tu correo', // APROBADO (D-149, mismo mecanismo que el staff)
  emailNote: 'Escribe el correo al que llegó el W-9 y te enviaremos un código.', // D-200 (patrón D-208)
  email: 'Correo', // APROBADO (muestra ronda 13)
  sendCode: 'Enviar código', // APROBADO (D-149)
  codeTitle: 'Escribe tu código', // APROBADO (muestra ronda 4)
  codeNote: 'Si es tu correo, te llegará un código de 6 dígitos. Vale 10 minutos.', // D-200 (patrón D-150)
  resendCode: 'Reenviar código', // APROBADO (D-150, D-163)
  wrongCode: 'El código es incorrecto o ya venció. Revisa tu correo e inténtalo otra vez.', // APROBADO (D-156)
  locked: 'Demasiados intentos. Pide un código nuevo.', // D-208 (D-209)
  rateLimited: 'Pediste demasiados códigos. Espera un momento e inténtalo otra vez.', // APROBADO (D-156)
  invalidEmail: 'Escribe un correo válido.', // APROBADO (D-156)
  network: 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.', // D-208 (patrón D-156)
  error: 'Algo salió mal. Inténtalo otra vez.', // D-208
  reviewNote: 'Cid Clean ya llenó tus datos. Revísalos y corrige lo que haga falta.', // D-200
  name: 'Nombre', // APROBADO (muestra)
  business: 'Nombre del negocio', // APROBADO (muestra)
  classification: 'Clasificación fiscal', // APROBADO (muestra)
  address: 'Dirección', // APROBADO (muestra)
  edit: 'Editar', // APROBADO (muestra)
  save: 'Guardar', // D-200
  cancel: 'Cancelar', // APROBADO
  tinSsn: 'SSN', // APROBADO (muestra)
  tinItin: 'ITIN', // APROBADO (muestra)
  tinEin: 'EIN', // APROBADO (D-256)
  tinLabel: { ssn: 'Número de Seguro Social', itin: 'Número de identificación personal del contribuyente (ITIN)', ein: 'Número de identificación del empleador (EIN)' }, // D-200
  tinLock: 'Solo va en tu W-9 firmado. No se guarda en la app.', // APROBADO (muestra)
  badTin: { ssn: 'Revisa tu SSN: son 9 dígitos y no empieza con 9.', itin: 'Revisa tu ITIN: son 9 dígitos y empieza con 9.', ein: 'Revisa tu EIN: son 9 dígitos.' }, // D-200
  continue: 'Continuar', // APROBADO (muestra)
  signTitle: 'Firma tu W-9', // APROBADO (muestra)
  readAll: 'Leer todo', // APROBADO (muestra)
  showLess: 'Ver menos', // D-200
  helpTranslation: 'Traducción de ayuda (lo que firmas es el texto en inglés):', // D-200
  typeName: 'Escribe tu nombre legal completo para firmar', // APROBADO (muestra, en español)
  agree: 'Acepto que escribir mi nombre es mi firma electrónica en este Formulario W-9.', // APROBADO (muestra, en español)
  dateNote: (d: string) => `Fecha: ${d} · se registra con la hora y la IP`, // APROBADO (muestra, en español)
  signSubmit: 'Firmar y enviar', // APROBADO (muestra, en español)
  preview: 'Ver el W-9 en PDF', // APROBADO (muestra, en español)
  previewNote: 'La vista previa no lleva tu número ni tu firma.', // D-200
  needName: 'Escribe tu nombre completo para firmar.', // D-200
  needAgree: 'Marca la casilla para firmar.', // D-200
  doneTitle: 'Listo, tu W-9 quedó firmado', // D-200
  doneBody: 'Cid Clean ya lo recibió. Puedes cerrar esta página.', // D-200
  signedTitle: 'Este W-9 ya está firmado', // D-200
  signedBody: 'No tienes que hacer nada más.', // D-200
  expiredTitle: 'Este link venció', // D-200
  expiredBody: 'Pídele a Cid Clean que te lo reenvíe.', // D-200
  replacedTitle: 'Hay un link más nuevo', // D-200
  replacedBody: 'Abre el link del correo más reciente de Cid Clean.', // D-200
  notFoundTitle: 'Link no válido', // D-208
  notFoundBody: 'Revisa que el link sea el del correo de Cid Clean.', // D-200
  home: 'Abre el link del correo de tu W-9.', // D-200
  loading: 'Cargando', // APROBADO (D-250)
  back: 'Volver', // APROBADO
};

export type W9PortalStrings = typeof w9PortalEs;

export const w9PortalEn: W9PortalStrings = {
  brand: 'Cid Clean',
  yourW9: 'Your W-9',
  emailTitle: 'Sign in with your email',
  emailNote: "Enter the email where you got the W-9 and we'll send you a code.",
  email: 'Email',
  sendCode: 'Send code',
  codeTitle: 'Enter your code',
  codeNote: "If it's your email, you'll get a 6-digit code. It's valid for 10 minutes.",
  resendCode: 'Resend code',
  wrongCode: 'The code is wrong or expired. Check your email and try again.',
  locked: 'Too many attempts. Ask for a new code.',
  rateLimited: 'You asked for too many codes. Wait a moment and try again.',
  invalidEmail: 'Enter a valid email.',
  network: "We couldn't connect. Check your connection and try again.",
  error: 'Something went wrong. Try again.',
  reviewNote: 'Cid Clean already filled in your details. Check them and fix anything that is wrong.',
  name: 'Name',
  business: 'Business name',
  classification: 'Tax classification',
  address: 'Address',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  tinSsn: 'SSN',
  tinItin: 'ITIN',
  tinEin: 'EIN',
  tinLabel: { ssn: 'Social Security Number', itin: 'Individual Taxpayer Identification Number', ein: 'Employer Identification Number' },
  tinLock: 'Only goes into your signed W-9. It is not saved in the app.',
  badTin: { ssn: 'Check your SSN: 9 digits, not starting with 9.', itin: 'Check your ITIN: 9 digits, starting with 9.', ein: 'Check your EIN: 9 digits.' },
  continue: 'Continue',
  signTitle: 'Sign your W-9',
  readAll: 'Read all',
  showLess: 'Show less',
  helpTranslation: 'Help translation (what you sign is the English text):',
  typeName: 'Type your full legal name to sign',
  agree: 'I agree that typing my name is my electronic signature on this Form W-9.',
  dateNote: (d) => `Date: ${d} · recorded with time and IP`,
  signSubmit: 'Sign and submit',
  preview: 'Preview W-9 PDF',
  previewNote: "The preview doesn't include your number or signature.",
  needName: 'Type your full name to sign.',
  needAgree: 'Check the box to sign.',
  doneTitle: 'Done, your W-9 is signed',
  doneBody: 'Cid Clean already has it. You can close this page.',
  signedTitle: 'This W-9 is already signed',
  signedBody: "You don't need to do anything else.",
  expiredTitle: 'This link expired',
  expiredBody: 'Ask Cid Clean to send it again.',
  replacedTitle: 'There is a newer link',
  replacedBody: 'Open the link in the most recent email from Cid Clean.',
  notFoundTitle: 'Invalid link',
  notFoundBody: 'Make sure it is the link from the Cid Clean email.',
  home: 'Open the link in your W-9 email.',
  loading: 'Loading',
  back: 'Back',
};

export function getW9PortalStrings(l: 'es' | 'en'): W9PortalStrings {
  return l === 'es' ? w9PortalEs : w9PortalEn;
}
