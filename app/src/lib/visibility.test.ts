import {
  homeKind,
  showsMonthFigures,
  homeShortcuts,
  showsCompanySettings,
  visibleTabs,
  type Access,
} from './visibility';

// Catálogo de permisos (current/permisos.md, D-145, D-193, D-252: 37 permisos) y plantillas de partida (D-152).
const ALL_37 = [
  'leads_ver', 'leads_editar', 'leads_eliminar', 'walkthroughs_hacer', 'quotes_ver', 'quotes_editar',
  'quotes_enviar', 'quotes_ver_precios', 'sow_contratos_subir_ver',
  'clientes_ver', 'clientes_editar_datos', 'clientes_editar_walkthrough_sow', 'clientes_ver_tarifa',
  'clientes_cambiar_estado',
  'empleados_ver', 'empleados_invitar_crear', 'empleados_editar_desactivar', 'empleados_ver_pagos',
  'empleados_asignar_pago', 'empleados_gestionar_permisos', 'empleados_gestionar_documentos',
  'schedule_ver_editar', 'work_registrar_por_otros', 'work_editar', 'work_aprobar', 'work_revisar_gps',
  'ingresos_ver_registrar', 'ingresos_marcar_recibidos', 'personal_ver_costo', 'gastos_ver',
  'gastos_registrar_editar', 'gastos_recurrentes', 'dashboard_global', 'dashboard_cuenta', 'reportes_exportar',
  'estadisticas_ver', 'historial_ver',
];
const ADMIN_36 = ALL_37.filter((k) => k !== 'empleados_gestionar_permisos');
const SUPERVISOR_8 = [
  'leads_ver', 'walkthroughs_hacer', 'clientes_ver', 'empleados_ver', 'schedule_ver_editar',
  'work_registrar_por_otros', 'work_editar', 'work_revisar_gps',
];

const access = (isSuperAdmin: boolean, perms: string[]): Access => ({ isSuperAdmin, permissions: new Set(perms) });
const superAdmin = access(true, []);
const admin = access(false, ADMIN_36);
const supervisor = access(false, SUPERVISOR_8);
const employee = access(false, []);

describe('plantillas de partida (D-152)', () => {
  test('el catálogo tiene 37 permisos y el Admin 36', () => {
    expect(ALL_37).toHaveLength(37);
    expect(new Set(ALL_37).size).toBe(37);
    expect(ADMIN_36).toHaveLength(36);
    expect(SUPERVISOR_8).toHaveLength(8);
  });
});

describe('barra inferior (D-337: Home, Leads, Accounts, Schedule; sin Menú)', () => {
  test('Super Admin: los cuatro destinos, en orden', () => {
    expect(visibleTabs(superAdmin)).toEqual(['home', 'pipeline', 'accounts', 'schedule']);
  });
  test('Admin de partida: los cuatro destinos', () => {
    expect(visibleTabs(admin)).toEqual(['home', 'pipeline', 'accounts', 'schedule']);
  });
  test('Supervisor: Inicio, Leads (leads_ver), Accounts (clientes_ver) y Schedule', () => {
    expect(visibleTabs(supervisor)).toEqual(['home', 'pipeline', 'accounts', 'schedule']);
  });
  test('Empleado sin permisos: solo Inicio', () => {
    expect(visibleTabs(employee)).toEqual(['home']);
  });
  test('Schedule sale con el schedule o cualquier permiso de Work', () => {
    for (const k of ['schedule_ver_editar', 'work_registrar_por_otros', 'work_editar', 'work_aprobar', 'work_revisar_gps']) {
      expect(visibleTabs(access(false, [k]))).toEqual(['home', 'schedule']);
    }
  });
  test('Pipeline sale con cualquier permiso de Ventas, uno por uno', () => {
    for (const k of ['leads_ver', 'leads_editar', 'leads_eliminar', 'walkthroughs_hacer', 'quotes_ver', 'quotes_editar',
      'quotes_enviar', 'quotes_ver_precios', 'sow_contratos_subir_ver']) {
      expect(visibleTabs(access(false, [k]))).toEqual(['home', 'pipeline']);
    }
  });
  test('Cuentas sale solo con clientes_ver; otros permisos de clientes no bastan', () => {
    expect(visibleTabs(access(false, ['clientes_ver']))).toEqual(['home', 'accounts']);
    expect(visibleTabs(access(false, ['clientes_editar_datos', 'clientes_ver_tarifa']))).toEqual(['home']);
  });
  test('permisos que no son de Ventas ni clientes_ver no agregan destinos', () => {
    expect(visibleTabs(access(false, ['gastos_ver', 'empleados_ver']))).toEqual(['home']);
  });
});

describe('accesos del Inicio (D-337)', () => {
  test('Super Admin: los seis, en el orden de la muestra', () => {
    expect(homeShortcuts(superAdmin)).toEqual(['schedule', 'employees', 'accounting', 'statistics', 'documents', 'history']);
  });
  test('Admin de partida: los seis', () => {
    expect(homeShortcuts(admin)).toEqual(['schedule', 'employees', 'accounting', 'statistics', 'documents', 'history']);
  });
  test('Supervisor: Schedule, Employees y Documents', () => {
    expect(homeShortcuts(supervisor)).toEqual(['schedule', 'employees', 'documents']);
  });
  test('Empleado: ninguno', () => {
    expect(homeShortcuts(employee)).toEqual([]);
  });
  test('Accounting sale con cualquiera de sus 9 permisos, uno por uno', () => {
    for (const k of ['ingresos_ver_registrar', 'ingresos_marcar_recibidos', 'personal_ver_costo', 'gastos_ver',
      'gastos_registrar_editar', 'gastos_recurrentes', 'dashboard_global', 'dashboard_cuenta', 'reportes_exportar']) {
      expect(homeShortcuts(access(false, [k]))).toContain('accounting');
    }
    expect(homeShortcuts(access(false, ['historial_ver']))).not.toContain('accounting');
  });
  test('D-252: Estadísticas solo con estadisticas_ver, y ese permiso solo no abre Accounting', () => {
    expect(homeShortcuts(access(false, ['estadisticas_ver']))).toEqual(['statistics']);
    expect(homeShortcuts(access(false, ['dashboard_global']))).not.toContain('statistics');
  });
  test('Historial con historial_ver; Empleados con empleados_ver; Schedule con schedule_ver_editar', () => {
    expect(homeShortcuts(access(false, ['historial_ver']))).toContain('history');
    expect(homeShortcuts(access(false, ['empleados_ver']))).toContain('employees');
    expect(homeShortcuts(access(false, ['schedule_ver_editar']))).toContain('schedule');
    expect(homeShortcuts(access(false, ['empleados_invitar_crear']))).not.toContain('employees');
  });
  test('Company settings de Mi cuenta: nunca por permisos, solo el Super Admin', () => {
    expect(showsCompanySettings(superAdmin)).toBe(true);
    expect(showsCompanySettings(access(false, ALL_37))).toBe(false);
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
