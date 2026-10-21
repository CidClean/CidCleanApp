import type { Locale } from '@/i18n';
import { isValidEmail } from './email';
import { can, type Access } from './visibility';

/** Reglas puras de la administración de empleados (D-171 a D-175, D-181 a D-185). Sin React ni red. */

export type WorkerType = 'w2' | '1099';
export type RoleKey = 'employee' | 'supervisor' | 'admin';
export type DocumentKind = 'w9' | 'insurance_certificate';

export type Employee = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  workerType: WorkerType | null;
  role: RoleKey;
  isSuperAdmin: boolean;
  hasAppAccess: boolean;
  language: Locale;
  active: boolean;
  firstLoginAt: string | null;
};

export type EmployeeDocument = {
  id: string;
  kind: DocumentKind;
  uploadedAt: string;
};

export const DOCUMENT_KINDS: readonly DocumentKind[] = ['w9', 'insurance_certificate'];

/** Iniciales del círculo: primera letra de las dos primeras palabras, en mayúscula. */
export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = words[0][0];
  const second = words.length > 1 ? words[1][0] : '';
  return (first + second).toUpperCase();
}

/** Lista en orden alfabético por nombre, sin distinguir mayúsculas ni acentos (D-083). */
export function sortEmployees<T extends { fullName: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' }));
}

// ---------------------------------------------------------------------------------------------
// Nuevo empleado (D-171)

export type NewEmployeeForm = {
  fullName: string;
  phone: string;
  workerType: WorkerType;
  role: RoleKey;
  hasAppAccess: boolean;
  email: string;
  language: Locale;
};

/** Valores de partida: W-2, rol Empleado, con acceso a la app (como la muestra aprobada) e inglés (D-171). */
export function emptyNewEmployee(): NewEmployeeForm {
  return { fullName: '', phone: '', workerType: 'w2', role: 'employee', hasAppAccess: true, email: '', language: 'en' };
}

export type NewEmployeeErrors = { fullName?: 'required'; email?: 'invalid' };

/** Validaciones simples en pantalla: nombre obligatorio y, con acceso a la app, un correo válido. */
export function validateNewEmployee(form: NewEmployeeForm): NewEmployeeErrors {
  const errors: NewEmployeeErrors = {};
  if (form.fullName.trim() === '') errors.fullName = 'required';
  if (form.hasAppAccess && !isValidEmail(form.email.trim())) errors.email = 'invalid';
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

/** Cuerpo que recibe la Edge Function create-employee. */
export function createEmployeeBody(form: NewEmployeeForm) {
  return {
    full_name: form.fullName.trim(),
    phone: form.phone.trim(),
    worker_type: form.workerType,
    role: form.role,
    language: form.language,
    has_app_access: form.hasAppAccess,
    email: form.hasAppAccess ? form.email.trim().toLowerCase() : '',
  };
}

// ---------------------------------------------------------------------------------------------
// Datos del perfil (D-174): solo se editan Nombre, Teléfono, Tipo e Idioma.

export type EditForm = {
  fullName: string;
  phone: string;
  workerType: WorkerType | null;
  language: Locale;
};

export function editFormFrom(e: Employee): EditForm {
  return { fullName: e.fullName, phone: e.phone ?? '', workerType: e.workerType, language: e.language };
}

export function validateEdit(form: EditForm): { fullName?: 'required' } {
  return form.fullName.trim() === '' ? { fullName: 'required' } : {};
}

export function editChanged(e: Employee, form: EditForm): boolean {
  const original = editFormFrom(e);
  return (
    form.fullName.trim() !== original.fullName ||
    form.phone.trim() !== original.phone ||
    form.workerType !== original.workerType ||
    form.language !== original.language
  );
}

// ---------------------------------------------------------------------------------------------
// Acceso a la app (D-172, D-184)

export type AccessState = { kind: 'none' } | { kind: 'pending' } | { kind: 'active'; since: string };

export function accessState(e: Pick<Employee, 'hasAppAccess' | 'firstLoginAt'>): AccessState {
  if (!e.hasAppAccess) return { kind: 'none' };
  if (e.firstLoginAt === null) return { kind: 'pending' };
  return { kind: 'active', since: e.firstLoginAt };
}

// ---------------------------------------------------------------------------------------------
// Qué ve y qué usa cada persona según sus permisos (D-169, D-125)

/** Icono + de la lista (D-185). */
export function canCreateEmployees(access: Access): boolean {
  return can(access, 'empleados_invitar_crear');
}

/** Botón Editar (D-174): solo el Super Admin edita al Super Admin. */
export function canEditEmployee(access: Access, target: Pick<Employee, 'isSuperAdmin'>): boolean {
  if (!can(access, 'empleados_editar_desactivar')) return false;
  return !target.isSuperAdmin || access.isSuperAdmin;
}

/** Interruptor Activo (D-173): no se desactiva al Super Admin ni a uno mismo. */
export function canToggleActive(access: Access, target: Pick<Employee, 'id' | 'isSuperAdmin'>, ownProfileId: string | null): boolean {
  if (!can(access, 'empleados_editar_desactivar')) return false;
  return !target.isSuperAdmin && target.id !== ownProfileId;
}

/** Botón Reenviar invitación (D-172): con el permiso de crear y mientras no haya primer ingreso. */
export function canResendInvitation(access: Access, target: Pick<Employee, 'hasAppAccess' | 'firstLoginAt' | 'active'>): boolean {
  return can(access, 'empleados_invitar_crear') && target.active && accessState(target).kind === 'pending';
}

/** Documentos (D-125, D-175, D-193): solo los 1099 y solo quien gestiona documentos; ver pagos ya no basta. */
export function showsDocuments(access: Access, target: Pick<Employee, 'workerType'>): boolean {
  return target.workerType === '1099' && can(access, 'empleados_gestionar_documentos');
}

export type DocumentRow = { kind: DocumentKind; state: 'uploaded' | 'missing'; uploadedAt: string | null; documentId: string | null };

/** Una fila por tipo de documento: vigente (Subido) o sin archivo (Falta). */
export function documentRows(documents: readonly EmployeeDocument[]): DocumentRow[] {
  return DOCUMENT_KINDS.map((kind) => {
    const doc = documents.find((d) => d.kind === kind);
    return doc
      ? { kind, state: 'uploaded', uploadedAt: doc.uploadedAt, documentId: doc.id }
      : { kind, state: 'missing', uploadedAt: null, documentId: null };
  });
}

// ---------------------------------------------------------------------------------------------
// Fechas: "12 oct 2026" (muestra ronda 15) y su versión en inglés.

const MONTHS: Record<Locale, readonly string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export function formatDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const month = MONTHS[locale][d.getMonth()];
  return locale === 'es' ? `${d.getDate()} ${month} ${d.getFullYear()}` : `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Extensión del archivo según su tipo, para la ruta en el almacenamiento. */
export function extensionFor(mimeType: string | null | undefined, fileName?: string | null): string {
  switch ((mimeType ?? '').toLowerCase()) {
    case 'application/pdf':
      return 'pdf';
    case 'image/png':
      return 'png';
    case 'image/heic':
      return 'heic';
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
  }
  const fromName = /\.([A-Za-z0-9]{2,5})$/.exec(fileName ?? '')?.[1]?.toLowerCase();
  return fromName ?? 'jpg';
}
