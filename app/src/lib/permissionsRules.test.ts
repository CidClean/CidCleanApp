import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import {
  ALL_PERMISSION_KEYS,
  AREAS,
  applyTemplate,
  areaState,
  canSeePay,
  diffPermissions,
  hasPendingChanges,
  heldKeys,
  permissionsMode,
  roleToSave,
  toggled,
  visibleAreas,
} from './permissionsRules';
import type { Access } from './visibility';

const access = (isSuperAdmin: boolean, perms: string[] = []): Access => ({ isSuperAdmin, permissions: new Set(perms) });
const target = (over: Partial<{ id: string; isSuperAdmin: boolean }> = {}) => ({ id: 't1', isSuperAdmin: false, ...over });

const SUPERVISOR_8 = [
  'leads_ver', 'walkthroughs_hacer', 'clientes_ver', 'empleados_ver', 'schedule_ver_editar',
  'work_registrar_por_otros', 'work_editar', 'work_revisar_gps',
];

describe('catálogo (D-193, D-252: 37 permisos en 6 áreas)', () => {
  test('37 permisos sin repetir, en el orden de la muestra: Ventas, Clientes y jobsites, Empleados, Schedule y Work, Accounting, Sistema', () => {
    expect(ALL_PERMISSION_KEYS).toHaveLength(37);
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(37);
    expect(AREAS.map((a) => a.key)).toEqual(['ventas', 'clientes', 'empleados', 'schedule_work', 'accounting', 'sistema']);
    expect(AREAS.find((a) => a.key === 'empleados')?.keys).toHaveLength(7);
    expect(AREAS.find((a) => a.key === 'empleados')?.keys).toContain('empleados_gestionar_documentos');
  });

  test('cada permiso tiene su nombre en español y en inglés, y ninguno sobra', () => {
    expect(Object.keys(es.permissions.labels).sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
    expect(Object.keys(en.permissions.labels).sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
    for (const k of ALL_PERMISSION_KEYS) {
      expect((es.permissions.labels as Record<string, string>)[k].length).toBeGreaterThan(0);
      expect((en.permissions.labels as Record<string, string>)[k].length).toBeGreaterThan(0);
    }
  });

  test('el nombre aprobado del permiso nuevo', () => {
    expect(es.permissions.labels.empleados_gestionar_documentos).toBe('Gestionar documentos de empleados');
  });
});

describe('fichas de área (D-110)', () => {
  const keys = ['a', 'b', 'c'];
  test('Todo, Parcial y Sin acceso según los permisos listados', () => {
    expect(areaState(keys, new Set(['a', 'b', 'c']))).toBe('all');
    expect(areaState(keys, new Set(['a']))).toBe('partial');
    expect(areaState(keys, new Set())).toBe('none');
    expect(areaState(keys, new Set(['x']))).toBe('none');
  });
});

describe('modo de la pestaña Permisos (D-192, D-194)', () => {
  test('con empleados_gestionar_permisos se edita a otra persona', () => {
    expect(permissionsMode(access(false, ['empleados_ver', 'empleados_gestionar_permisos']), target(), 'yo')).toBe('edit');
    expect(permissionsMode(access(true), target(), 'yo')).toBe('edit');
  });
  test('sin ese permiso es solo lectura', () => {
    expect(permissionsMode(access(false, ['empleados_ver']), target(), 'yo')).toBe('readonly');
  });
  test('nadie edita sus propios permisos, tampoco el Super Admin ni quien gestiona permisos', () => {
    expect(permissionsMode(access(false, ['empleados_gestionar_permisos']), target({ id: 'yo' }), 'yo')).toBe('readonly');
    expect(permissionsMode(access(true), target({ id: 'yo' }), 'yo')).toBe('readonly');
  });
  test('el perfil del Super Admin queda bloqueado para todos, incluido él mismo', () => {
    expect(permissionsMode(access(true), target({ isSuperAdmin: true }), 'otro')).toBe('locked');
    expect(permissionsMode(access(true), target({ id: 'yo', isSuperAdmin: true }), 'yo')).toBe('locked');
    expect(permissionsMode(access(false, ['empleados_gestionar_permisos']), target({ isSuperAdmin: true }), 'yo')).toBe('locked');
  });
});

describe('Pagos (D-194)', () => {
  test('solo con empleados_ver_pagos hay contenido; sin él, el aviso', () => {
    expect(canSeePay(access(false, ['empleados_ver']))).toBe(false);
    expect(canSeePay(access(false, ['empleados_gestionar_documentos']))).toBe(false);
    expect(canSeePay(access(false, ['empleados_ver_pagos']))).toBe(true);
    expect(canSeePay(access(true))).toBe(true);
  });
});

describe('qué se lista (D-191)', () => {
  test('quien tiene todo ve las 6 áreas y los 37 permisos', () => {
    const areas = visibleAreas(access(true), new Set());
    expect(areas.map((a) => a.key)).toHaveLength(6);
    expect(areas.flatMap((a) => a.keys)).toHaveLength(37);
  });

  test('solo se listan los permisos que quien mira tiene y un área sin ninguno no aparece', () => {
    const viewer = access(false, ['empleados_ver', 'empleados_gestionar_permisos', 'leads_ver']);
    const areas = visibleAreas(viewer, new Set(['empleados_ver']));
    expect(areas.map((a) => a.key)).toEqual(['ventas', 'empleados']);
    expect(areas[0].keys).toEqual(['leads_ver']);
    expect(areas[1].keys).toEqual(['empleados_ver', 'empleados_gestionar_permisos']);
  });

  test('la ficha cuenta solo los permisos listados', () => {
    const viewer = access(false, ['empleados_ver', 'empleados_gestionar_permisos']);
    // El perfil tiene Ver lista, pero también Invitar y crear, que quien mira no tiene: no cuenta.
    expect(visibleAreas(viewer, new Set(['empleados_ver', 'empleados_gestionar_permisos', 'empleados_invitar_crear']))[0].state).toBe('all');
    expect(visibleAreas(viewer, new Set(['empleados_ver']))[0].state).toBe('partial');
    expect(visibleAreas(viewer, new Set())[0].state).toBe('none');
  });

  test('bloqueado (Super Admin): todas las áreas en Todo', () => {
    expect(visibleAreas(access(true), new Set(), true).every((a) => a.state === 'all')).toBe(true);
  });

  test('heldKeys: lo que se puede tocar', () => {
    expect(heldKeys(access(true))).toHaveLength(37);
    expect(heldKeys(access(false, ['leads_ver', 'inventado']))).toEqual(['leads_ver']);
  });
});

describe('aplicar una plantilla (D-189, D-191)', () => {
  test('reemplaza los permisos que quien edita tiene por los de la plantilla que también tiene', () => {
    const held = ['leads_ver', 'clientes_ver', 'empleados_ver', 'work_editar'];
    const current = new Set(['leads_ver', 'work_editar']);
    const next = applyTemplate(current, SUPERVISOR_8, held);
    expect([...next].sort()).toEqual(['clientes_ver', 'empleados_ver', 'leads_ver', 'work_editar']);
  });

  test('la plantilla Empleado quita lo que quien edita puede quitar y deja lo que no ve', () => {
    const held = ['leads_ver'];
    const current = new Set(['leads_ver', 'gastos_ver']);
    expect([...applyTemplate(current, [], held)]).toEqual(['gastos_ver']);
  });

  test('nunca da un permiso que quien edita no tiene', () => {
    const next = applyTemplate(new Set(), SUPERVISOR_8, ['leads_ver']);
    expect([...next]).toEqual(['leads_ver']);
  });

  test('el Super Admin aplica la plantilla completa', () => {
    const next = applyTemplate(new Set(), SUPERVISOR_8, ALL_PERMISSION_KEYS);
    expect(next.size).toBe(8);
  });
});

describe('cambios pendientes (D-188, D-190)', () => {
  const saved = new Set(['leads_ver', 'clientes_ver']);

  test('sin cambios: nada por guardar', () => {
    expect(diffPermissions(saved, new Set(saved))).toEqual({ grant: [], revoke: [] });
    expect(hasPendingChanges({ grant: [], revoke: [] }, 'employee', 'employee')).toBe(false);
  });

  test('lo nuevo se da, lo que falta se quita', () => {
    const wanted = new Set(['leads_ver', 'work_editar']);
    expect(diffPermissions(saved, wanted)).toEqual({ grant: ['work_editar'], revoke: ['clientes_ver'] });
    expect(hasPendingChanges(diffPermissions(saved, wanted), 'employee', 'employee')).toBe(true);
  });

  test('encender y volver a apagar no deja nada pendiente', () => {
    const back = toggled(toggled(saved, 'work_editar', true), 'work_editar', false);
    expect(diffPermissions(saved, back)).toEqual({ grant: [], revoke: [] });
  });

  test('una plantilla aplicada sin cambio de permisos igual deja el rol pendiente', () => {
    expect(hasPendingChanges({ grant: [], revoke: [] }, 'employee', 'supervisor')).toBe(true);
  });

  test('el rol solo se envía si cambió', () => {
    expect(roleToSave('employee', 'employee')).toBeNull();
    expect(roleToSave('employee', 'supervisor')).toBe('supervisor');
  });
});
