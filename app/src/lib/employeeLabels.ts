import type { Strings } from '@/i18n/es';
import type { Employee, RoleKey, WorkerType } from './employeeRules';

/** Etiquetas visibles de tipo y rol (D-083, D-171). */

export function typeLabel(strings: Strings, workerType: WorkerType | null): string {
  if (workerType === 'w2') return strings.employees.w2;
  if (workerType === '1099') return strings.employees.contractor;
  return '';
}

export function roleLabel(strings: Strings, role: RoleKey, isSuperAdmin = false): string {
  if (isSuperAdmin) return strings.employees.roleSuperAdmin;
  switch (role) {
    case 'admin':
      return strings.employees.roleAdmin;
    case 'supervisor':
      return strings.employees.roleSupervisor;
    default:
      return strings.employees.roleEmployee;
  }
}

/** "Tipo · Rol", como en la lista y en el encabezado del perfil (D-083, D-057). Sin tipo, solo el rol. */
export function subtitle(strings: Strings, e: Pick<Employee, 'workerType' | 'role' | 'isSuperAdmin'>): string {
  const type = typeLabel(strings, e.workerType);
  const role = roleLabel(strings, e.role, e.isSuperAdmin);
  return type ? `${type} · ${role}` : role;
}
