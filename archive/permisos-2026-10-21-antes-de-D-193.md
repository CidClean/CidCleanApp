# Permisos

Catálogo de permisos que usa la base de datos (`supabase/migrations/20261021000001_etapa1_perfiles_y_permisos.sql`). Cada permiso sale de la tabla "Roles y permisos" de `flujo.md` (D-014) y el dueño confirmó esta lista el 2026-10-21 (D-145). Las etiquetas visibles, en inglés y español, viven en la app. Si algo cambia, se edita aquí, se registra y la versión anterior pasa a `../archive/`.

Hay 35 permisos delegables. Dos funciones del Sistema no se delegan y solo las tiene el Super Admin: la configuración general y transferir el rol (D-014).

| Área | Claves |
| --- | --- |
| Ventas (9) | `leads_ver`, `leads_editar`, `leads_eliminar`, `walkthroughs_hacer`, `quotes_ver`, `quotes_editar`, `quotes_enviar`, `quotes_ver_precios`, `sow_contratos_subir_ver` |
| Clientes y jobsites (5) | `clientes_ver`, `clientes_editar_datos`, `clientes_editar_walkthrough_sow`, `clientes_ver_tarifa`, `clientes_cambiar_estado` |
| Empleados (6) | `empleados_ver`, `empleados_invitar_crear`, `empleados_editar_desactivar`, `empleados_ver_pagos`, `empleados_asignar_pago`, `empleados_gestionar_permisos` |
| Schedule y Work (5) | `schedule_ver_editar`, `work_registrar_por_otros`, `work_editar`, `work_aprobar`, `work_revisar_gps` |
| Accounting (9) | `ingresos_ver_registrar`, `ingresos_marcar_recibidos`, `personal_ver_costo`, `gastos_ver`, `gastos_registrar_editar`, `gastos_recurrentes`, `dashboard_global`, `dashboard_cuenta`, `reportes_exportar` |
| Sistema (1) | `historial_ver` |

## Plantillas de partida (D-152)

El rol es solo una plantilla: al crear un perfil se marcan estos permisos y después se ajustan uno por uno (D-014, D-058).

| Plantilla | Permisos de partida |
| --- | --- |
| Empleado | Ninguno. Ver su horario y hacer clock in y clock out no necesita permisos. |
| Supervisor (8) | `leads_ver`, `walkthroughs_hacer`, `clientes_ver`, `empleados_ver`, `schedule_ver_editar`, `work_registrar_por_otros`, `work_editar`, `work_revisar_gps` |
| Admin (34) | Los 35 permisos menos `empleados_gestionar_permisos`. Incluye `gastos_registrar_editar`. |

El Supervisor parte sin ver tarifas ni pagos y sin Accounting. El Admin no puede dar ni quitar permisos mientras no se le dé `empleados_gestionar_permisos` a mano. El Super Admin tiene todo y no usa plantilla.
