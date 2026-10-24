import type { Locale } from './index';

/**
 * Textos de la bandeja y de Mis notificaciones (hito 7, orden 28). El título y el detalle de cada aviso vienen de la
 * base (notification_text, migración 20261027000003), la misma fuente del correo. APROBADO = de una decisión o
 * muestra aprobada (ronda 10, D-084, D-085, D-215); D-200 = detalle menor del ejecutor.
 */
export const notificationsEs = {
  title: 'Notificaciones', // APROBADO (D-134)
  empty: 'No tienes notificaciones.', // D-200
  markAll: 'Marcar leídas', // D-200
  errorLoad: 'No se pudieron cargar las notificaciones. Inténtalo otra vez.', // D-200
  unread: (n: number) => (n === 1 ? '1 sin leer' : `${n} sin leer`), // APROBADO (muestra D-226: "3 sin leer")
  unreadLabel: 'Sin leer', // D-200 (lector de pantalla del punto)
  settingsRow: 'Mis notificaciones', // APROBADO (D-085)
  settingsTitle: 'Mis notificaciones', // APROBADO (D-085)
  push: 'Push', // APROBADO (D-085)
  pushHint: 'En tu teléfono', // APROBADO (muestra ronda 10)
  pushSoon: 'Pronto', // D-200 (D-215: push más adelante)
  email: 'Email', // APROBADO (D-085)
  emailHint: 'A tu correo', // APROBADO (muestra ronda 10)
  inApp: 'En la app', // APROBADO (D-085)
  inAppHint: 'Dentro de la bandeja', // APROBADO (muestra ronda 10)
  settingsNote: 'Valen para todas las áreas. Recibes solo los avisos de lo que tienes permiso de ver. Lo acumulado llega en un resumen diario a las 8:00 AM.', // D-200 (D-215)
  errorSave: 'No se pudo guardar. Inténtalo otra vez.', // D-200
};

export type NotificationsStrings = typeof notificationsEs;

export const notificationsEn: NotificationsStrings = {
  title: 'Notifications',
  empty: "You don't have notifications.",
  markAll: 'Mark as read',
  errorLoad: "Notifications couldn't load. Try again.",
  unread: (n: number) => `${n} unread`,
  unreadLabel: 'Unread',
  settingsRow: 'My notifications',
  settingsTitle: 'My notifications',
  push: 'Push',
  pushHint: 'On your phone',
  pushSoon: 'Coming soon',
  email: 'Email',
  emailHint: 'To your email',
  inApp: 'In the app',
  inAppHint: 'In your inbox',
  settingsNote: 'They apply to every area. You only get notices about what you have permission to see. Accumulated items arrive in a daily summary at 8:00 AM.',
  errorSave: "Couldn't save. Try again.",
};

export function getNotificationsStrings(locale: Locale): NotificationsStrings {
  return locale === 'es' ? notificationsEs : notificationsEn;
}
