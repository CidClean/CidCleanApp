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

Con qué permisos parte cada plantilla (Admin, Supervisor, Empleado) todavía no está decidido; se propone al dueño en una ronda aparte.
