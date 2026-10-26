import { can, type Access } from './visibility';
import type { Employee, RoleKey } from './employeeRules';

/**
 * Reglas puras de la pestaña Permisos del perfil (D-058, D-110, D-188 a D-194). Sin React ni red.
 * El catálogo es el de la base (tabla `permissions`, 37 permisos delegables (D-252), current/flujo.md "Roles y permisos").
 */

export type AreaKey = 'ventas' | 'clientes' | 'empleados' | 'schedule_work' | 'accounting' | 'sistema';

/** Las 6 áreas en el orden de la muestra aprobada (ronda 16) y sus permisos en el orden de la base. */
export const AREAS: readonly { key: AreaKey; keys: readonly string[] }[] = [
  {
    key: 'ventas',
    keys: [
      'leads_ver',
      'leads_editar',
      'leads_eliminar',
      'walkthroughs_hacer',
      'quotes_ver',
      'quotes_editar',
      'quotes_enviar',
      'quotes_ver_precios',
      'sow_contratos_subir_ver',
    ],
  },
  {
    key: 'clientes',
    keys: [
      'clientes_ver',
      'clientes_editar_datos',
      'clientes_editar_walkthrough_sow',
      'clientes_ver_tarifa',
      'clientes_cambiar_estado',
    ],
  },
  {
    key: 'empleados',
    keys: [
      'empleados_ver',
      'empleados_invitar_crear',
      'empleados_editar_desactivar',
      'empleados_ver_pagos',
      'empleados_asignar_pago',
      'empleados_gestionar_permisos',
      'empleados_gestionar_documentos',
    ],
  },
  {
    key: 'schedule_work',
    keys: ['schedule_ver_editar', 'work_registrar_por_otros', 'work_editar', 'work_aprobar', 'work_revisar_gps'],
  },
  {
    key: 'accounting',
    keys: [
      'ingresos_ver_registrar',
      'ingresos_marcar_recibidos',
      'personal_ver_costo',
      'gastos_ver',
      'gastos_registrar_editar',
      'gastos_recurrentes',
      'dashboard_global',
      'dashboard_cuenta',
      'reportes_exportar',
      'estadisticas_ver',
    ],
  },
  { key: 'sistema', keys: ['historial_ver'] },
];

export const ALL_PERMISSION_KEYS: readonly string[] = AREAS.flatMap((a) => a.keys);

export type AreaState = 'all' | 'partial' | 'none';

/** Cómo se puede usar la pestaña: editar, solo leer o bloqueada (Super Admin, D-192). */
export type PermissionsMode = 'edit' | 'readonly' | 'locked';

/**
 * Modo de la pestaña Permisos (D-192, D-194):
 *  - el Super Admin tiene todo y nadie lo cambia, ni él mismo: bloqueada;
 *  - nadie edita sus propios permisos, y sin `empleados_gestionar_permisos` solo se lee: solo lectura;
 *  - en los demás casos, se edita.
 */
export function permissionsMode(
  access: Access,
  target: Pick<Employee, 'id' | 'isSuperAdmin'>,
  ownProfileId: string | null,
): PermissionsMode {
  if (target.isSuperAdmin) return 'locked';
  if (target.id === ownProfileId) return 'readonly';
  return can(access, 'empleados_gestionar_permisos') ? 'edit' : 'readonly';
}

/** Pagos (D-194): sin `empleados_ver_pagos` se ve el aviso y ninguna cifra. */
export function canSeePay(access: Access): boolean {
  return can(access, 'empleados_ver_pagos');
}

export type VisibleArea = { key: AreaKey; keys: string[]; state: AreaState };

/** Un área es "Todo" si están todos sus permisos visibles, "Sin acceso" si no hay ninguno y "Parcial" si hay algunos (D-110). */
export function areaState(keys: readonly string[], on: ReadonlySet<string>): AreaState {
  const count = keys.filter((k) => on.has(k)).length;
  if (keys.length > 0 && count === keys.length) return 'all';
  return count === 0 ? 'none' : 'partial';
}

/**
 * Las áreas y permisos que se muestran: solo los que quien mira también tiene (D-191); un área donde no tiene
 * ninguno no se lista. El chip cuenta solo los permisos listados. `on` son los permisos encendidos del perfil.
 * En el modo bloqueado (Super Admin) todos los listados están encendidos.
 */
export function visibleAreas(access: Access, on: ReadonlySet<string>, locked = false): VisibleArea[] {
  const result: VisibleArea[] = [];
  for (const area of AREAS) {
    const keys = area.keys.filter((k) => can(access, k));
    if (keys.length === 0) continue;
    const state = locked ? 'all' : areaState(keys, on);
    result.push({ key: area.key, keys, state });
  }
  return result;
}

/** Los permisos que quien mira tiene (los únicos que puede tocar, D-191). */
export function heldKeys(access: Access): string[] {
  return ALL_PERMISSION_KEYS.filter((k) => can(access, k));
}

/**
 * Aplicar una plantilla (D-189): reemplaza los permisos que quien edita puede tocar por los de la plantilla que
 * él también tiene. Lo que no tiene ni ve no se toca. Devuelve el conjunto encendido resultante.
 */
export function applyTemplate(
  current: ReadonlySet<string>,
  templateKeys: readonly string[],
  held: readonly string[],
): Set<string> {
  const next = new Set<string>();
  const heldSet = new Set(held);
  for (const k of current) if (!heldSet.has(k)) next.add(k);
  for (const k of templateKeys) if (heldSet.has(k)) next.add(k);
  return next;
}

export type PermissionChanges = { grant: string[]; revoke: string[] };

/** Cambios pendientes: lo que hay que dar y lo que hay que quitar para pasar de `saved` a `wanted`, en el orden del catálogo. */
export function diffPermissions(saved: ReadonlySet<string>, wanted: ReadonlySet<string>): PermissionChanges {
  return {
    grant: ALL_PERMISSION_KEYS.filter((k) => wanted.has(k) && !saved.has(k)),
    revoke: ALL_PERMISSION_KEYS.filter((k) => saved.has(k) && !wanted.has(k)),
  };
}

/** Hay algo por guardar: permisos distintos o un rol de plantilla nuevo (D-188, D-190). */
export function hasPendingChanges(changes: PermissionChanges, savedRole: RoleKey, pendingRole: RoleKey): boolean {
  return changes.grant.length > 0 || changes.revoke.length > 0 || pendingRole !== savedRole;
}

/** Rol que se envía al guardar: solo si cambió respecto al guardado (D-190); si no, null (el servidor lo deja igual). */
export function roleToSave(savedRole: RoleKey, pendingRole: RoleKey): RoleKey | null {
  return pendingRole === savedRole ? null : pendingRole;
}

/** Enciende o apaga un permiso en el conjunto pendiente. */
export function toggled(on: ReadonlySet<string>, key: string, value: boolean): Set<string> {
  const next = new Set(on);
  if (value) next.add(key);
  else next.delete(key);
  return next;
}
