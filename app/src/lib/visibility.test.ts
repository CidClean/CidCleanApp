import {
  homeKind,
  showsMonthFigures,
  visibleMenuItems,
  visibleTabs,
  type Access,
} from './visibility';

// Catálogo de permisos (current/permisos.md, D-145) y plantillas de partida (D-152).
const ALL_35 = [
  'leads_ver', 'leads_editar', 'leads_eliminar', 'walkthroughs_hacer', 'quotes_ver', 'quotes_editar',
  'quotes_enviar', 'quotes_ver_precios', 'sow_contratos_subir_ver',
  'clientes_ver', 'clientes_editar_datos', 'clientes_editar_walkthrough_sow', 'clientes_ver_tarifa',
  'clientes_cambiar_estado',
  'empleados_ver', 'empleados_invitar_crear', 'empleados_editar_desactivar', 'empleados_ver_pagos',
  'empleados_asignar_pago', 'empleados_gestionar_permisos',
  'schedule_ver_editar', 'work_registrar_por_otros', 'work_editar', 'work_aprobar', 'work_revisar_gps',
  'ingresos_ver_registrar', 'ingresos_marcar_recibidos', 'personal_ver_costo', 'gastos_ver',
  'gastos_registrar_editar', 'gastos_recurrentes', 'dashboard_global', 'dashboard_cuenta', 'reportes_exportar',
  'historial_ver',
];
const ADMIN_34 = ALL_35.filter((k) => k !== 'empleados_gestionar_permisos');
const SUPERVISOR_8 = [
  'leads_ver', 'walkthroughs_hacer', 'clientes_ver', 'empleados_ver', 'schedule_ver_editar',
  'work_registrar_por_otros', 'work_editar', 'work_revisar_gps',
];

const access = (isSuperAdmin: boolean, perms: string[]): Access => ({ isSuperAdmin, permissions: new Set(perms) });
const superAdmin = access(true, []);
const admin = access(false, ADMIN_34);
const supervisor = access(false, SUPERVISOR_8);
const employee = access(false, []);

describe('plantillas de partida (D-152)', () => {
  test('el catálogo tiene 35 permisos y el Admin 34', () => {
    expect(ALL_35).toHaveLength(35);
    expect(new Set(ALL_35).size).toBe(35);
    expect(ADMIN_34).toHaveLength(34);
    expect(SUPERVISOR_8).toHaveLength(8);
  });
});

describe('barra inferior (D-132, D-169)', () => {
  test('Super Admin: los cuatro destinos, en orden', () => {
    expect(visibleTabs(superAdmin)).toEqual(['pipeline', 'accounts', 'home', 'menu']);
  });
  test('Admin de partida: los cuatro destinos', () => {
    expect(visibleTabs(admin)).toEqual(['pipeline', 'accounts', 'home', 'menu']);
  });
  test('Supervisor: Pipeline (leads_ver), Cuentas (clientes_ver), Inicio y Menú', () => {
    expect(visibleTabs(supervisor)).toEqual(['pipeline', 'accounts', 'home', 'menu']);
  });
  test('Empleado sin permisos: solo Inicio y Menú', () => {
    expect(visibleTabs(employee)).toEqual(['home', 'menu']);
  });
  test('Pipeline sale con cualquier permiso de Ventas, uno por uno', () => {
    for (const k of ['leads_ver', 'leads_editar', 'leads_eliminar', 'walkthroughs_hacer', 'quotes_ver', 'quotes_editar',
      'quotes_enviar', 'quotes_ver_precios', 'sow_contratos_subir_ver']) {
      expect(visibleTabs(access(false, [k]))).toEqual(['pipeline', 'home', 'menu']);
    }
  });
  test('Cuentas sale solo con clientes_ver; otros permisos de clientes no bastan', () => {
    expect(visibleTabs(access(false, ['clientes_ver']))).toEqual(['accounts', 'home', 'menu']);
    expect(visibleTabs(access(false, ['clientes_editar_datos', 'clientes_ver_tarifa']))).toEqual(['home', 'menu']);
  });
  test('permisos que no son de Ventas ni clientes_ver no agregan destinos', () => {
    expect(visibleTabs(access(false, ['gastos_ver', 'empleados_ver']))).toEqual(['home', 'menu']);
  });
});

describe('Menú (D-134, D-169)', () => {
  test('Super Admin: todo, incluido Ajustes', () => {
    expect(visibleMenuItems(superAdmin)).toEqual([
      'employees', 'scheduleWork', 'accounting', 'settings', 'history', 'notifications', 'profile',
    ]);
  });
  test('Admin de partida: todo menos Ajustes', () => {
    expect(visibleMenuItems(admin)).toEqual([
      'employees', 'scheduleWork', 'accounting', 'history', 'notifications', 'profile',
    ]);
  });
  test('Supervisor: Empleados, Schedule y Work, Notificaciones y Mi perfil', () => {
    expect(visibleMenuItems(supervisor)).toEqual(['employees', 'scheduleWork', 'notifications', 'profile']);
  });
  test('Empleado: solo Notificaciones y Mi perfil', () => {
    expect(visibleMenuItems(employee)).toEqual(['notifications', 'profile']);
  });
  test('Accounting sale con cualquiera de sus 9 permisos, uno por uno', () => {
    for (const k of ['ingresos_ver_registrar', 'ingresos_marcar_recibidos', 'personal_ver_costo', 'gastos_ver',
      'gastos_registrar_editar', 'gastos_recurrentes', 'dashboard_global', 'dashboard_cuenta', 'reportes_exportar']) {
      expect(visibleMenuItems(access(false, [k]))).toContain('accounting');
    }
    expect(visibleMenuItems(access(false, ['historial_ver']))).not.toContain('accounting');
  });
  test('Ajustes nunca sale por permisos, solo para el Super Admin', () => {
    expect(visibleMenuItems(access(false, ALL_35))).not.toContain('settings');
  });
  test('Historial con historial_ver; Empleados con empleados_ver; Schedule con schedule_ver_editar', () => {
    expect(visibleMenuItems(access(false, ['historial_ver']))).toContain('history');
    expect(visibleMenuItems(access(false, ['empleados_ver']))).toContain('employees');
    expect(visibleMenuItems(access(false, ['schedule_ver_editar']))).toContain('scheduleWork');
    expect(visibleMenuItems(access(false, ['empleados_invitar_crear']))).not.toContain('employees');
  });
});

describe('Inicio (D-164, D-165, D-169)', () => {
  test('admin para el Super Admin y para quien tenga al menos un permiso; staff para quien no tenga', () => {
    expect(homeKind(superAdmin)).toBe('admin');
    expect(homeKind(admin)).toBe('admin');
    expect(homeKind(supervisor)).toBe('admin');
    expect(homeKind(access(false, ['leads_ver']))).toBe('admin');
    expect(homeKind(employee)).toBe('staff');
  });
  test('las cifras del mes solo con dashboard_global (el Super Admin las tiene)', () => {
    expect(showsMonthFigures(superAdmin)).toBe(true);
    expect(showsMonthFigures(admin)).toBe(true);
    expect(showsMonthFigures(supervisor)).toBe(false);
    expect(showsMonthFigures(access(false, ['dashboard_cuenta']))).toBe(false);
    expect(showsMonthFigures(employee)).toBe(false);
  });
});
