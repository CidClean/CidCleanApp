import type { Locale } from '@/i18n';
import type { Strings } from '@/i18n/es';
import { roleLabel } from './employeeLabels';
import type { RoleKey } from './employeeRules';

/** Historial de cambios (D-088, D-198): una fila por cambio con título corto, "{a quién o qué} · por {quién}" y la hora. */

type ProfileState = { role?: string; worker_type?: string | null; active?: boolean; is_super_admin?: boolean; has_app_access?: boolean };

export type HistoryEntry = {
  id: number;
  at: string;
  action: string;
  /** A quién o qué (nombre resuelto por el servidor), o null. */
  subject: string | null;
  /** Quién lo hizo, o null (el sistema). */
  actor: string | null;
  /** Solo lo que sirve para el título: nunca montos ni archivos. */
  info: {
    permiso?: string;
    kind?: string;
    version?: number | string;
    label_es?: string;
    label_en?: string;
    antes?: ProfileState;
    despues?: ProfileState;
  };
};

function permissionName(strings: Strings, key: string | undefined): string {
  if (!key) return '';
  return (strings.permissions.labels as Record<string, string>)[key] ?? key;
}

function documentName(strings: Strings, kind: string | undefined): string {
  if (kind === 'w9') return strings.employee.w9;
  if (kind === 'insurance_certificate') return strings.employee.insuranceCertificate;
  return kind ?? '';
}

function changedTitle(strings: Strings, e: HistoryEntry): string {
  const h = strings.history;
  const a = e.info.antes ?? {};
  const d = e.info.despues ?? {};
  if (a.is_super_admin !== d.is_super_admin && d.is_super_admin !== undefined) {
    return d.is_super_admin ? h.becameSuperAdmin : h.leftSuperAdmin;
  }
  if (a.active !== d.active && d.active !== undefined) return d.active ? h.employeeReactivated : h.employeeDeactivated;
  if (a.role !== d.role && d.role) return h.roleChanged(roleLabel(strings, d.role as RoleKey));
  if (a.worker_type !== d.worker_type && d.worker_type) {
    return h.typeChanged(d.worker_type === '1099' ? strings.employees.contractor : strings.employees.w2);
  }
  if (a.has_app_access !== d.has_app_access && d.has_app_access !== undefined) {
    return d.has_app_access ? h.accessGiven : h.accessRemoved;
  }
  return h.employeeEdited;
}

/** Título corto de la fila. Una acción desconocida tiene un título genérico (no falla). */
export function historyTitle(strings: Strings, e: HistoryEntry): string {
  const h = strings.history;
  const version = e.info.version !== undefined ? String(e.info.version) : '';
  switch (e.action) {
    case 'perfil_creado':
      return h.employeeCreated;
    case 'perfil_cambiado':
      return changedTitle(strings, e);
    case 'invitacion_enviada':
      return h.invitationSent;
    case 'invitacion_reenviada':
      return h.invitationResent;
    case 'invitacion_fallida':
      return h.invitationFailed;
    case 'permiso_dado':
      return h.permissionGiven(permissionName(strings, e.info.permiso));
    case 'permiso_quitado':
      return h.permissionRemoved(permissionName(strings, e.info.permiso));
    case 'documento_subido':
      return h.documentUploaded(documentName(strings, e.info.kind));
    case 'documento_reemplazado':
      return h.documentReplaced(documentName(strings, e.info.kind));
    case 'documento_abierto':
      return h.documentOpened(documentName(strings, e.info.kind));
    case 'w9_enviado':
      return h.w9Sent;
    case 'w9_reenviado':
      return h.w9Resent;
    case 'w9_firmado':
      return h.w9Signed;
    case 'terminos_publicados':
      return h.termsPublished(version);
    case 'terminos_aceptados':
      return h.termsAccepted(version);
    case 'super_admin_transferido':
      return h.superAdminTransferred;
    case 'lead_creado':
      return h.leadCreated;
    case 'lead_estado_cambiado':
      return h.leadStatusChanged;
    case 'lead_eliminado':
      return h.leadDeleted;
    case 'walkthrough_agendado':
      return h.walkthroughScheduled;
    case 'walkthrough_reagendado':
      return h.walkthroughRescheduled;
    case 'walkthrough_estado_cambiado':
      return h.walkthroughStatusChanged;
    case 'quote_creado':
      return h.quoteCreated;
    case 'quote_version_nueva':
      return h.quoteNewVersion(version);
    case 'quote_enviado':
      return h.quoteSent(version);
    case 'quote_visto':
      return h.quoteViewed(version);
    case 'quote_aceptado':
      return h.quoteAccepted(version);
    case 'quote_rechazado':
      return h.quoteRejected(version);
    case 'quote_cambios_pedidos':
      return h.quoteChanges(version);
    case 'cliente_creado':
      return h.clientCreated;
    case 'jobsite_creado':
      return h.jobsiteCreated;
    case 'sitio_editado':
      return h.siteEdited;
    case 'sitio_eliminado':
      return h.siteDeleted;
    case 'motivo_creado':
      return h.reasonCreated;
    case 'motivo_editado':
      return h.reasonEdited;
    case 'motivo_desactivado':
      return h.reasonDeactivated;
    case 'motivo_eliminado':
      return h.reasonDeleted;
    default:
      return h.unknown;
  }
}

/**
 * Detalle gris: "{a quién o qué} · por {quién}". Términos aceptados: solo quién (muestra ronda 17).
 * Motivos de lead perdido: la etiqueta en el idioma de la app (D-203).
 */
export function historyDetail(strings: Strings, e: HistoryEntry, locale: Locale = 'es'): string {
  const h = strings.history;
  if (e.action === 'terminos_aceptados') return e.actor ?? '';
  let subject = e.subject;
  if (subject === null && (e.info.label_es || e.info.label_en)) {
    subject = (locale === 'en' ? e.info.label_en : e.info.label_es) ?? e.info.label_es ?? e.info.label_en ?? null;
  }
  if (e.action === 'terminos_publicados' || e.action === 'terminos_aceptados') {
    const kinds = h.termsKinds as Record<string, string>;
    subject = subject ? (kinds[subject] ?? subject) : null;
  }
  const by = e.actor ? h.by(e.actor) : null;
  return [subject, by].filter((x): x is string => Boolean(x)).join(' · ');
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const MONTHS: Record<Locale, readonly string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/**
 * Hora de la fila (D-198): "Hoy 2:35 p. m.", "Ayer 6:02 p. m.", "12 oct 9:15 a. m."; en inglés "Today 2:35 PM",
 * "Yesterday 6:02 PM", "Oct 12 9:15 AM". De otro año se agrega el año. Hora local del teléfono.
 */
export function historyTime(strings: Strings, locale: Locale, iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = strings.history;
  const hour = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const clock = `${hour}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? h.am : h.pm}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, now)) return `${h.today} ${clock}`;
  if (sameDay(d, yesterday)) return `${h.yesterday} ${clock}`;
  const month = MONTHS[locale][d.getMonth()];
  const year = d.getFullYear() !== now.getFullYear() ? d.getFullYear() : null;
  if (locale === 'es') return `${d.getDate()} ${month}${year ? ` ${year}` : ''} ${clock}`;
  return `${month} ${d.getDate()}${year ? `, ${year}` : ''} ${clock}`;
}

/** Junta una página nueva a la lista sin repetir filas (por id) y en orden, la más reciente arriba. */
export function mergePage(current: readonly HistoryEntry[], page: readonly HistoryEntry[]): HistoryEntry[] {
  const seen = new Set(current.map((e) => e.id));
  return [...current, ...page.filter((e) => !seen.has(e.id))].sort((a, b) => b.id - a.id);
}

export const HISTORY_PAGE = 30;
