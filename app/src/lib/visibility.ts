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

export type TabKey = 'home' | 'pipeline' | 'accounts' | 'schedule';
/** Accesos del Inicio (D-337): los destinos que antes estaban en el Menú. */
export type ShortcutKey = 'schedule' | 'employees' | 'accounting' | 'statistics' | 'documents' | 'history';

/** Permisos que abren Schedule & Work (hito 6: el schedule o cualquier permiso de Work). */
export const SCHEDULE_KEYS = ['schedule_ver_editar', 'work_registrar_por_otros', 'work_editar', 'work_aprobar', 'work_revisar_gps'] as const;

export function can(access: Access, key: string): boolean {
  return access.isSuperAdmin || access.permissions.has(key);
}

export function canAny(access: Access, keys: readonly string[]): boolean {
  return access.isSuperAdmin || keys.some((k) => access.permissions.has(k));
}

/**
 * Barra inferior (D-337): Home, Leads, Accounts y Schedule; ya no hay Menú. Inicio siempre; cada otra pestaña solo
 * con su permiso. Quien no tiene ninguno (staff) ve solo Inicio, con su horario.
 */
export function visibleTabs(access: Access): TabKey[] {
  const tabs: TabKey[] = ['home'];
  if (canAny(access, SALES_KEYS)) tabs.push('pipeline');
  if (can(access, 'clientes_ver')) tabs.push('accounts');
  if (canAny(access, SCHEDULE_KEYS)) tabs.push('schedule');
  return tabs;
}

/**
 * Menú → Documentos (orden 115, D-317 4): solo con al menos un permiso que dé documentos (las mismas reglas de
 * documents_library: quotes con precios, SOW, clientes, walkthroughs, documentos del personal o pagos).
 */
export function canSeeDocuments(access: Access): boolean {
  if (access.isSuperAdmin) return true;
  const p = access.permissions;
  return (
    (p.has('quotes_ver') && p.has('quotes_ver_precios')) ||
    ['sow_contratos_subir_ver', 'clientes_ver', 'walkthroughs_hacer', 'leads_ver', 'clientes_editar_walkthrough_sow',
      'empleados_gestionar_documentos', 'empleados_ver_pagos'].some((k) => p.has(k))
  );
}

/**
 * Accesos del Inicio (D-337), en el orden de la muestra: Schedule, Employees, Accounting, Statistics, Documents e
 * History, cada uno con su permiso. Notificaciones va en la campana; Mi perfil y Ajustes, en "Mi cuenta".
 */
export function homeShortcuts(access: Access): ShortcutKey[] {
  const items: ShortcutKey[] = [];
  if (canAny(access, SCHEDULE_KEYS)) items.push('schedule');
  if (can(access, 'empleados_ver')) items.push('employees');
  if (canAny(access, ACCOUNTING_KEYS)) items.push('accounting');
  // D-252: Estadísticas, con su propio permiso (no abre Accounting).
  if (can(access, 'estadisticas_ver')) items.push('statistics');
  if (canSeeDocuments(access)) items.push('documents');
  if (can(access, 'historial_ver')) items.push('history');
  return items;
}

/** "Company settings" de Mi cuenta (D-337): solo el Super Admin (D-114). */
export function showsCompanySettings(access: Access): boolean {
  return access.isSuperAdmin;
}

/** Inicio del admin para el Super Admin y para quien tenga al menos un permiso; del staff para quien no tenga ninguno. */
export function homeKind(access: Access): 'admin' | 'staff' {
  return access.isSuperAdmin || access.permissions.size > 0 ? 'admin' : 'staff';
}

/** Las cifras Ingresos del mes y Profit solo con `dashboard_global`. */
export function showsMonthFigures(access: Access): boolean {
  return can(access, 'dashboard_global');
}
