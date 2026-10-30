import type { Locale } from '@/i18n';
import { isValidEmail } from './email';
import { formatPhone, isValidPhone, normalizePhone } from './phone';
import { isUsState, isValidZip } from './usStates';
import { can, type Access } from './visibility';

/** Reglas puras de la administración de empleados (D-171 a D-175, D-181 a D-185). Sin React ni red. */

export type WorkerType = 'w2' | '1099';
export type RoleKey = 'employee' | 'supervisor' | 'admin';
export type DocumentKind = 'w9' | 'insurance_certificate';

/** Dirección del empleado (D-264): State es el código de 2 letras o ''. */
export type Address = { addressLine1: string; addressLine2: string; state: string; city: string; zip: string };

export type Employee = {
  id: string;
  fullName: string;
  /** D-267: null en los perfiles que existían antes; full_name se arma de los dos al guardar. */
  firstName: string | null;
  lastName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  state: string | null;
  city: string | null;
  zip: string | null;
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
// Nuevo empleado (D-171, D-264): Nombre, Apellidos, Teléfono, Email, Dirección, Dirección 2, State, City y ZIP code.

export type NewEmployeeForm = Address & {
  firstName: string;
  lastName: string;
  phone: string;
  workerType: WorkerType;
  role: RoleKey;
  hasAppAccess: boolean;
  email: string;
  language: Locale;
};

export function emptyAddress(): Address {
  return { addressLine1: '', addressLine2: '', state: '', city: '', zip: '' };
}

/** Valores de partida: W-2, rol Empleado, con acceso a la app (como la muestra aprobada) e inglés (D-171). */
export function emptyNewEmployee(): NewEmployeeForm {
  return {
    firstName: '', lastName: '', phone: '', workerType: 'w2', role: 'employee', hasAppAccess: true, email: '', language: 'en',
    ...emptyAddress(),
  };
}

export type PersonErrors = { firstName?: 'required'; lastName?: 'required'; phone?: 'invalid'; state?: 'invalid'; zip?: 'invalid' };
export type NewEmployeeErrors = PersonErrors & { email?: 'invalid' };

/** Nombre y Apellidos obligatorios (D-267 (3)); teléfono de EE. UU. opcional (D-216); State de la lista y ZIP de 5 o 5+4. */
function personErrors(form: Address & { firstName: string; lastName: string; phone: string }): PersonErrors {
  const errors: PersonErrors = {};
  if (form.firstName.trim() === '') errors.firstName = 'required';
  if (form.lastName.trim() === '') errors.lastName = 'required';
  if (!isValidPhone(form.phone)) errors.phone = 'invalid';
  if (form.state !== '' && !isUsState(form.state)) errors.state = 'invalid';
  if (!isValidZip(form.zip)) errors.zip = 'invalid';
  return errors;
}

/** Validaciones en pantalla; con acceso a la app, un correo válido (entra con él). */
export function validateNewEmployee(form: NewEmployeeForm): NewEmployeeErrors {
  const errors: NewEmployeeErrors = personErrors(form);
  if (form.hasAppAccess && !isValidEmail(form.email.trim())) errors.email = 'invalid';
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

function addressBody(a: Address) {
  return {
    address_line1: a.addressLine1.trim(),
    address_line2: a.addressLine2.trim(),
    state: a.state,
    city: a.city.trim(),
    zip: a.zip.trim(),
  };
}

/** Cuerpo que recibe la Edge Function create-employee. */
export function createEmployeeBody(form: NewEmployeeForm) {
  return {
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    phone: normalizePhone(form.phone),
    worker_type: form.workerType,
    role: form.role,
    language: form.language,
    has_app_access: form.hasAppAccess,
    email: form.hasAppAccess ? form.email.trim().toLowerCase() : '',
    ...addressBody(form),
  };
}

// ---------------------------------------------------------------------------------------------
// Datos del perfil (D-174, D-264): Nombre, Apellidos, Teléfono, dirección, Tipo e Idioma. El correo no se edita aquí.

export type EditForm = Address & {
  firstName: string;
  lastName: string;
  phone: string;
  workerType: WorkerType | null;
  language: Locale;
};

export function editFormFrom(e: Employee): EditForm {
  return {
    firstName: e.firstName ?? '',
    lastName: e.lastName ?? '',
    phone: formatPhone(e.phone),
    workerType: e.workerType,
    language: e.language,
    addressLine1: e.addressLine1 ?? '',
    addressLine2: e.addressLine2 ?? '',
    state: e.state ?? '',
    city: e.city ?? '',
    zip: e.zip ?? '',
  };
}

export function validateEdit(form: EditForm): PersonErrors {
  return personErrors(form);
}

export function editChanged(e: Employee, form: EditForm): boolean {
  const original = editFormFrom(e);
  const text: (keyof EditForm)[] = ['firstName', 'lastName', 'phone', 'addressLine1', 'addressLine2', 'city', 'zip'];
  return (
    text.some((k) => String(form[k] ?? '').trim() !== String(original[k] ?? '')) ||
    form.state !== original.state ||
    form.workerType !== original.workerType ||
    form.language !== original.language
  );
}

/** Cuerpo de update_employee (versión de D-264). */
export function updateEmployeeArgs(profileId: string, form: EditForm) {
  const a = addressBody(form);
  return {
    p_profile: profileId,
    p_first_name: form.firstName.trim(),
    p_last_name: form.lastName.trim(),
    p_phone: normalizePhone(form.phone) || null,
    p_worker_type: form.workerType,
    p_language: form.language,
    p_address_line1: a.address_line1 || null,
    p_address_line2: a.address_line2 || null,
    p_state: a.state || null,
    p_city: a.city || null,
    p_zip: a.zip || null,
  };
}

/** D-267 (2): perfil sin Nombre o sin Apellidos (los que ya existían) muestra el aviso ámbar. */
export function missingNameParts(e: Pick<Employee, 'firstName' | 'lastName'>): boolean {
  return !e.firstName?.trim() || !e.lastName?.trim();
}

/** Línea 5 del W-9 (D-267 (1)): Dirección y, si hay, Dirección 2. */
export function w9AddressLine(e: Pick<Employee, 'addressLine1' | 'addressLine2'>): string {
  return [e.addressLine1?.trim(), e.addressLine2?.trim()].filter(Boolean).join(', '); // D-200: separadas por coma
}

/** Línea 6 del W-9 (D-267 (1)): "City, ST ZIP" con lo que haya. */
export function w9CityLine(e: Pick<Employee, 'city' | 'state' | 'zip'>): string {
  const stateZip = [e.state?.trim(), e.zip?.trim()].filter(Boolean).join(' ');
  return [e.city?.trim(), stateZip].filter(Boolean).join(', ');
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
/** D-242: dar acceso a la app a quien se creó sin acceso (mismo permiso que crear). */
export function canGrantAccess(
  access: Access,
  target: Pick<Employee, 'hasAppAccess' | 'firstLoginAt' | 'active' | 'isSuperAdmin'>,
): boolean {
  return can(access, 'empleados_invitar_crear') && target.active && !target.isSuperAdmin && accessState(target).kind === 'none';
}

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
