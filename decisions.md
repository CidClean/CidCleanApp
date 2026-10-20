# Registro de decisiones

Cada decisión lleva fecha y estado. Una decisión **vigente** manda sobre todo lo demás. Cuando una decisión cambia, la entrada nueva dice a cuál reemplaza, la anterior pasa a **reemplazada** y el texto afectado se actualiza en `current/` en el mismo cambio. Lo reemplazado nunca se aplica.

Fechas en formato AAAA-MM-DD. Si se decide otro formato, se registra aquí como decisión nueva.

| ID | Fecha | Decisión | Estado | Reemplaza |
| --- | --- | --- | --- | --- |
| D-001 | 2026-10-20 | El proyecto se reinicia desde cero; primero flujo y funcionamiento, después diseño y arquitectura. | Vigente | — |
| D-002 | 2026-10-20 | Dos sectores: Ventas (Lead, Walkthrough, Quote y SOW, Aceptación) y Operaciones (Cliente y Jobsites, Empleados, Schedule, Work, Accounting). El Jobsite es el puente. | Vigente | — |
| D-003 | 2026-10-20 | Un lead es la empresa; cada sitio tiene su propio walkthrough y quote. Un cliente existente con sitio nuevo va directo a walkthrough, sin lead. | Vigente | — |
| D-004 | 2026-10-20 | El walkthrough funciona sin internet, fotos incluidas, y sincroniza después. Por ahora solo el dueño hace walkthroughs. | Vigente | — |
| D-005 | 2026-10-20 | El SOW y el contrato se crean fuera de la app; la app los guarda, versiona y adjunta al portal. El cliente debe leer el SOW antes de decidir. | Vigente | — |
| D-006 | 2026-10-20 | El quote es mensual, con vigencia de 30 días por defecto (editable). Tax predeterminado de 6%, editable, con casilla "gravable" por servicio y add-on que decide el dueño. | Vigente | — |
| D-007 | 2026-10-20 | Aceptación del quote registra nombre y cargo; rechazo pide motivo; negociación genera versión nueva (1.1, 1.2...). | Vigente | — |
| D-008 | 2026-10-20 | El cliente no tiene portal más allá de la aceptación del quote. Facturación y cobro se manejan fuera de la app. | Vigente | — |
| D-009 | 2026-10-20 | La tarifa al cliente es un monto total mensual por jobsite. El pago al empleado se define por asignación a jobsite: por hora (con horas garantizadas opcionales) o tarifa fija (por visita, semana o mes). | Vigente | — |
| D-010 | 2026-10-20 | Alerta de margen cuando el costo proyectado de personal iguala o supera lo que cobra el cliente, sin porcentaje mínimo. Suministros y equipo no entran en la alerta. | Vigente | — |
| D-011 | 2026-10-20 | Schedule y Work son independientes. Work solo sobre visitas programadas, con clock in/out por GPS; si el GPS falla se permite y se marca para revisión. Solo el trabajo aprobado cuenta. Una visita que no se hace se quita del schedule (no existe "no realizada"). | Vigente | — |
| D-012 | 2026-10-20 | Los empleados ven solo la semana actual y la siguiente de su schedule. | Vigente | — |
| D-013 | 2026-10-20 | Accounting: ingreso esperado por mes, marcado como recibido con fecha real (cuenta en el mes en que se registra). Costo de personal automático desde trabajo aprobado; la app no registra si se pagó. Gastos por jobsite o globales, con recurrentes automáticos. | Vigente | — |
| D-014 | 2026-10-20 | Permisos asignados uno por uno al crear el perfil; el rol es solo plantilla. Un único Super Admin; nadie da un permiso que no tiene. | Vigente | — |
| D-015 | 2026-10-20 | Notificaciones de todo tipo, solo a quien tiene el permiso relacionado; canal por persona (push, email, en la app). | Vigente | — |
| D-016 | 2026-10-20 | Operación en Naples, Florida. Staff W-2 y 1099 conviven (tipo por perfil). Salario mínimo de $15/h para W-2 por hora. | Vigente | — |
| D-017 | 2026-10-20 | No se permiten horas extra; alerta antes de 32 h semanales, sumando todos los jobsites, para todo el staff (W-2 y 1099). | Vigente | — |
| D-018 | 2026-10-20 | Términos y condiciones: los redacta un abogado fuera de la app; la app los guarda versionados y registra quién aceptó qué versión y cuándo (portal del cliente, staff, privacidad y emails). | Vigente | — |
| D-019 | 2026-10-20 | Idioma: inglés y español, inglés por defecto. | Vigente | — |
| D-020 | 2026-10-20 | Fuera de esta versión: acceso físico al jobsite, checklist por visita, renovaciones de contrato. | Vigente | — |
| D-021 | 2026-10-20 | Orden de trabajo: survey visual, survey de seguridad, y al final la arquitectura. | Vigente | — |
| D-022 | 2026-10-20 | Las reglas del repositorio (lo vigente manda, lo reemplazado nunca se aplica, cambiar es reemplazar) son obligatorias para toda persona o AI y viven en `AGENTS.md`. | Vigente | — |
