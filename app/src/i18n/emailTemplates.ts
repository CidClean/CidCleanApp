import type { Locale } from './index';

/**
 * Plantillas de correo (orden 120; D-321 a D-323). Los textos marcados APROBADO salen de
 * surveys/plantillas-correo-aprobado.html (D-323); los demás son detalles menores delegados (D-200).
 */
export const emailTemplatesEs = {
  row: 'Plantillas de correo', // APROBADO (D-323)
  rowDetail: (n: number) => (n === 1 ? '1 plantilla' : `${n} plantillas`), // D-200
  tabProspects: 'Prospectos', // APROBADO (D-323)
  tabClients: 'Clientes', // APROBADO (D-323)
  active: 'Activa', // APROBADO (D-323)
  inactive: 'Inactiva', // APROBADO (D-323)
  add: 'Nueva plantilla', // APROBADO (D-323)
  emptyProspects: 'Todavía no hay plantillas para prospectos.', // D-200
  emptyClients: 'Todavía no hay plantillas para clientes. Escribe la primera con "Nueva plantilla".', // D-200
  newTitle: 'Nueva plantilla', // APROBADO (D-323)
  editTitle: 'Editar plantilla', // APROBADO (D-323)
  name: 'Nombre', // APROBADO (D-323)
  audience: 'Para', // APROBADO (D-323)
  subject: 'Asunto', // APROBADO (D-323)
  body: 'Texto', // APROBADO (D-323)
  insert: 'Insertar', // APROBADO (D-323)
  insertLabel: (p: string) => `Insertar {${p}}`, // D-200
  footerNote: 'El pie legal se agrega solo al enviar. No hace falta escribirlo.', // APROBADO (D-323)
  activeSwitch: 'Activa (sale en la lista al enviar)', // D-200
  delete: 'Eliminar plantilla', // D-200
  deleteTitle: (n: string) => `¿Eliminar la plantilla "${n}"?`, // D-200
  deleteConfirm: 'Eliminar', // D-200
  errorName: 'Escribe el nombre.', // D-200
  errorSubject: 'Escribe el asunto.', // D-200
  errorBody: 'Escribe el texto.', // D-200
  errorLoad: 'No se pudieron cargar las plantillas. Inténtalo otra vez.', // D-200
  errorSave: 'No se pudo guardar la plantilla. Inténtalo otra vez.', // D-200
  errorDelete: 'No se pudo eliminar la plantilla. Inténtalo otra vez.', // D-200
  // Enviar correo (lead o cliente).
  send: 'Enviar correo', // APROBADO (D-323)
  listProspects: 'Plantillas para prospectos', // APROBADO (D-323)
  listClients: 'Plantillas para clientes', // D-200 (como la de prospectos)
  chipProspect: 'Prospecto', // APROBADO (D-323)
  chipClient: 'Cliente', // D-200
  continue: 'Continuar', // APROBADO (D-323)
  noTemplates: 'No hay plantillas activas para enviar. El Super Admin las crea en Ajustes → Plantillas de correo.', // D-200
  preview: 'Vista previa', // APROBADO (D-323)
  to: 'Para', // APROBADO (D-323)
  contact: 'Contacto', // D-200
  open: 'Abrir en mi correo', // APROBADO (D-323)
  copy: 'Copiar texto', // APROBADO (D-323)
  copied: 'Texto copiado.', // D-200
  missingTitle: 'Faltan datos para este correo. Complétalos antes de abrirlo.', // D-200
  missing: {
    nombre: 'Nombre del contacto', // D-200
    empresa: 'Empresa', // D-200
    dirección: 'Dirección', // D-200
    remitente: 'Tu nombre (firma)', // D-200
    telefono: 'Tu teléfono (firma)', // D-200
  },
  missingEmail: 'Falta el correo del contacto. Escríbelo para continuar.', // D-200
  badEmail: 'Correo no válido.', // D-200
  tooLong: 'El correo es muy largo para abrirlo desde el navegador. Usa "Copiar texto" y pégalo en tu correo.', // D-200
  openFailed: 'No se pudo abrir tu app de correo. Usa "Copiar texto".', // D-200
  errorContext: 'No se pudieron cargar los datos del contacto. Inténtalo otra vez.', // D-200
  errorLog: 'El correo se abrió, pero no quedó en el historial. Inténtalo otra vez.', // D-200
  // Línea de tiempo.
  logTitle: 'Correos enviados', // D-200
  logLine: (when: string, who: string | null) => (who ? `${when} · por ${who}` : when), // D-200 (como D-198)
  reminder: (v: string | null) => (v ? `Recordatorio del quote v${v}` : 'Recordatorio del quote'), // D-200
};

export type EmailTemplatesStrings = typeof emailTemplatesEs;

export const emailTemplatesEn: EmailTemplatesStrings = {
  row: 'Email templates',
  rowDetail: (n: number) => (n === 1 ? '1 template' : `${n} templates`),
  tabProspects: 'Prospects',
  tabClients: 'Clients',
  active: 'Active',
  inactive: 'Inactive',
  add: 'New template',
  emptyProspects: 'There are no templates for prospects yet.',
  emptyClients: 'There are no templates for clients yet. Write the first one with "New template".',
  newTitle: 'New template',
  editTitle: 'Edit template',
  name: 'Name',
  audience: 'For',
  subject: 'Subject',
  body: 'Text',
  insert: 'Insert',
  insertLabel: (p: string) => `Insert {${p}}`,
  footerNote: 'The legal footer is added when sending. No need to write it.',
  activeSwitch: 'Active (shows in the list when sending)',
  delete: 'Delete template',
  deleteTitle: (n: string) => `Delete the template "${n}"?`,
  deleteConfirm: 'Delete',
  errorName: 'Enter the name.',
  errorSubject: 'Enter the subject.',
  errorBody: 'Enter the text.',
  errorLoad: "Templates couldn't be loaded. Try again.",
  errorSave: "The template couldn't be saved. Try again.",
  errorDelete: "The template couldn't be deleted. Try again.",
  send: 'Send email',
  listProspects: 'Templates for prospects',
  listClients: 'Templates for clients',
  chipProspect: 'Prospect',
  chipClient: 'Client',
  continue: 'Continue',
  noTemplates: 'There are no active templates to send. The Super Admin creates them in Settings → Email templates.',
  preview: 'Preview',
  to: 'To',
  contact: 'Contact',
  open: 'Open in my email',
  copy: 'Copy text',
  copied: 'Text copied.',
  missingTitle: 'Some details are missing for this email. Fill them in before opening it.',
  missing: {
    nombre: 'Contact name',
    empresa: 'Company',
    dirección: 'Address',
    remitente: 'Your name (signature)',
    telefono: 'Your phone (signature)',
  },
  missingEmail: "The contact's email is missing. Enter it to continue.",
  badEmail: 'Invalid email.',
  tooLong: 'This email is too long to open from the browser. Use "Copy text" and paste it into your email.',
  openFailed: "Your email app couldn't be opened. Use \"Copy text\".",
  errorContext: "The contact details couldn't be loaded. Try again.",
  errorLog: "The email was opened, but it wasn't saved to the history. Try again.",
  logTitle: 'Emails sent',
  logLine: (when: string, who: string | null) => (who ? `${when} · by ${who}` : when),
  reminder: (v: string | null) => (v ? `Quote reminder v${v}` : 'Quote reminder'),
};

export function getEmailTemplatesStrings(locale: Locale): EmailTemplatesStrings {
  return locale === 'en' ? emailTemplatesEn : emailTemplatesEs;
}
