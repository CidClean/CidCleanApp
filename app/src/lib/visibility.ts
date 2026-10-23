/**
 * Quién ve qué (D-132, D-134, D-169). Todo puro: se alimenta con los permisos del perfil.
 * El Super Admin puede todo.
 */

export type Access = {
  isSuperAdmin: boolean;
  permissions: ReadonlySet<string>;
};

/** Permisos de Ventas (current/permisos.md). */
export const SALES_KEYS = [
  'leads_ver',
  'leads_editar',
  'leads_eliminar',
  'walkthroughs_hacer',
  'quotes_ver',
  'quotes_editar',
  'quotes_enviar',
  'quotes_ver_precios',
  'sow_contratos_subir_ver',
] as const;

/** Permisos de Accounting (current/permisos.md). */
export const ACCOUNTING_KEYS = [
  'ingresos_ver_registrar',
  'ingresos_marcar_recibidos',
  'personal_ver_costo',
  'gastos_ver',
  'gastos_registrar_editar',
  'gastos_recurrentes',
  'dashboard_global',
  'dashboard_cuenta',
  'reportes_exportar',
] as const;

export type TabKey = 'pipeline' | 'accounts' | 'home' | 'menu';
export type MenuKey =
  | 'employees'
  | 'scheduleWork'
  | 'accounting'
  | 'settings'
  | 'history'
  | 'notifications'
  | 'profile';

export function can(access: Access, key: string): boolean {
  return access.isSuperAdmin || access.permissions.has(key);
}

export function canAny(access: Access, keys: readonly string[]): boolean {
  return access.isSuperAdmin || keys.some((k) => access.permissions.has(k));
}

/** Barra inferior, en el orden de D-132: Pipeline, Cuentas, Inicio y Menú. Inicio y Menú siempre. */
export function visibleTabs(access: Access): TabKey[] {
  const tabs: TabKey[] = [];
  if (canAny(access, SALES_KEYS)) tabs.push('pipeline');
  if (can(access, 'clientes_ver')) tabs.push('accounts');
  tabs.push('home', 'menu');
  return tabs;
}

/** Filas del Menú, en el orden de D-134. Ajustes solo para el Super Admin (D-114). */
export function visibleMenuItems(access: Access): MenuKey[] {
  const items: MenuKey[] = [];
  if (can(access, 'empleados_ver')) items.push('employees');
  // Hito 6: el schedule o cualquier permiso de Work (aprobar, editar, revisar GPS o registrar por otros).
  if (canAny(access, ['schedule_ver_editar', 'work_registrar_por_otros', 'work_editar', 'work_aprobar', 'work_revisar_gps'])) items.push('scheduleWork');
  if (canAny(access, ACCOUNTING_KEYS)) items.push('accounting');
  if (access.isSuperAdmin) items.push('settings');
  if (can(access, 'historial_ver')) items.push('history');
  items.push('notifications', 'profile');
  return items;
}

/** Inicio del admin para el Super Admin y para quien tenga al menos un permiso; del staff para quien no tenga ninguno. */
export function homeKind(access: Access): 'admin' | 'staff' {
  return access.isSuperAdmin || access.permissions.size > 0 ? 'admin' : 'staff';
}

/** Las cifras Ingresos del mes y Profit solo con `dashboard_global`. */
export function showsMonthFigures(access: Access): boolean {
  return can(access, 'dashboard_global');
}
