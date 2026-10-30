import type { Locale } from './index';

/**
 * Textos de la legal rev. 3, fase B (órdenes 56 a 59: D-282, D-284, D-280). La interfaz va en el idioma del perfil; los
 * textos legales mismos solo en inglés (D-282). Todos son detalle menor delegado (D-200) salvo el aviso de la cámara,
 * que es el texto exacto de D-284 y de la orden 58.
 */
export const legalEs = {
  // Pantalla "Antes de empezar" (D-086, D-282)
  readPrivacy: 'Leer la Política de Privacidad', // D-200
  englishOnly: 'Los textos legales están en inglés.', // D-200 (D-282: solo en inglés)
  // Ajustes del Super Admin: Política de Privacidad (D-176, D-187, D-282)
  privacyRow: 'Política de Privacidad', // D-200
  majorChange: 'Cambio importante: todo el staff tendrá que aceptarla', // D-200
  notMajorNote: 'Si no es un cambio importante, al staff solo se le avisa.', // D-200
  // Cuenta → Eliminar cuenta (D-282, orden 57)
  accountSection: 'Cuenta', // D-200
  deleteAccount: 'Eliminar cuenta', // D-282
  deleteTitle: '¿Eliminar tu cuenta?', // D-200
  deleteBody:
    'Responderemos tu solicitud en un plazo de 30 días. Lo que la ley obliga a guardar (nómina, W-9, contratos) se conserva hasta que venza su plazo.', // D-200 (D-282)
  deleteMore: 'Más información', // D-200: enlace a https://app.cidclean.com/delete-account
  deleteConfirm: 'Enviar solicitud', // D-200
  cancel: 'Cancelar', // D-200
  requestSent: (date: string) => `Solicitud enviada el ${date}`, // orden 57
  errorRequest: 'No se pudo enviar la solicitud. Inténtalo otra vez.', // D-200 (estilo de D-178)
  // Ajustes del Super Admin: solicitudes (orden 57)
  requestsRow: 'Solicitudes de eliminación de cuenta', // D-200
  requestsEmpty: 'No hay solicitudes.', // D-200
  pending: 'Pendiente', // D-200
  done: (date: string) => `Atendida el ${date}`, // D-200
  requestedOn: (date: string) => `Pedida el ${date}`, // D-200
  markDone: 'Marcar como atendida', // D-200
  markDoneTitle: '¿Marcar como atendida?', // D-200
  markDoneBody: 'Se desactiva la cuenta y su acceso a la app. El borrado de los datos lo hace la retención.', // D-200
  errorLoad: 'No se pudieron cargar las solicitudes. Inténtalo otra vez.', // D-200
  errorDone: 'No se pudo marcar. Inténtalo otra vez.', // D-200
  // Aviso en la cámara y el selector de fotos del trabajo (D-284, texto exacto de la orden 58)
  cameraNotice: 'Fotografía el trabajo, no a las personas. Uso exclusivo de administración.',
};

export type LegalStrings = typeof legalEs;

export const legalEn: LegalStrings = {
  readPrivacy: 'Read the Privacy Policy',
  englishOnly: 'Legal texts are in English.',
  privacyRow: 'Privacy Policy',
  majorChange: 'Major change: all staff will have to accept it',
  notMajorNote: "If it isn't a major change, staff only get a notice.",
  accountSection: 'Account',
  deleteAccount: 'Delete account',
  deleteTitle: 'Delete your account?',
  deleteBody:
    "We'll respond to your request within 30 days. Anything the law requires us to keep (payroll, W-9, contracts) is kept until its retention period ends.",
  deleteMore: 'Learn more',
  deleteConfirm: 'Send request',
  cancel: 'Cancel',
  requestSent: (date: string) => `Request sent on ${date}`,
  errorRequest: "Couldn't send the request. Try again.",
  requestsRow: 'Account deletion requests',
  requestsEmpty: 'No requests.',
  pending: 'Pending',
  done: (date: string) => `Handled on ${date}`,
  requestedOn: (date: string) => `Requested on ${date}`,
  markDone: 'Mark as handled',
  markDoneTitle: 'Mark as handled?',
  markDoneBody: 'The account and its app access are deactivated. Data deletion is handled by retention.',
  errorLoad: "Couldn't load the requests. Try again.",
  errorDone: "Couldn't mark it. Try again.",
  cameraNotice: 'Photograph the work, not people. For administration use only.',
};

export function getLegalStrings(locale: Locale): LegalStrings {
  return locale === 'es' ? legalEs : legalEn;
}

/** Textos legales públicos, solo en inglés (D-282). */
export const LEGAL_URLS = {
  staff: 'https://app.cidclean.com/terms/staff',
  portal: 'https://app.cidclean.com/terms/client-portal',
  privacy: 'https://app.cidclean.com/privacy',
  deleteAccount: 'https://app.cidclean.com/delete-account',
} as const;
