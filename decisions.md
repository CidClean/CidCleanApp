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
| D-023 | 2026-10-20 | Toda elección aprobada se registra en el mismo turno con valores exactos y copia visual HTML, y no se construye nada que no esté registrado (reglas 8 y 9 de `AGENTS.md`). | Vigente | — |
| D-024 | 2026-10-20 | Color de marca: verde azulado `#0F766E`. | Vigente | — |
| D-025 | 2026-10-20 | Esquinas de botones: redondeadas, `12px`. | Vigente | — |
| D-026 | 2026-10-20 | Tipografía: Manrope. | Vigente | — |
| D-027 | 2026-10-20 | Lista de leads: lista compacta (filas separadas por línea fina, sin tarjeta). | Vigente | — |
| D-028 | 2026-10-20 | Modo: automático, sigue el modo claro u oscuro del teléfono. | Vigente | — |
| D-029 | 2026-10-20 | Navegación: barra inferior solo iconos (4 iconos, sin texto). | Vigente | — |
| D-030 | 2026-10-20 | Campos de formulario: con contorno (borde de 1px). | Vigente | — |
| D-031 | 2026-10-20 | Estados (chips): con contorno, en el color del estado. | Vigente | — |
| D-032 | 2026-10-20 | Alertas: tarjeta con borde en el color de la alerta, con icono. | Vigente | — |
| D-033 | 2026-10-20 | Grises y fondo (Neutro). Claro: fondo `#FFFFFF`, superficie `#F4F4F4`, texto `#1A1A1A`, borde `#E2E2E2`, secundario `#6B6B6B`. Oscuro: fondo `#121212`, superficie `#1C1C1C`, texto `#F2F2F2`, borde `#333333`, secundario `#A0A0A0`. | Vigente | — |
| D-034 | 2026-10-20 | Colores de estado suaves: éxito `#3F8F5F`, advertencia `#B7791F`, error `#C0504D`. | Vigente | — |
| D-035 | 2026-10-20 | Estilo de iconos: línea fina (trazo 1.5px, sin relleno). | Vigente | — |
| D-036 | 2026-10-20 | Densidad estándar: texto 15px, filas 48px, relleno vertical de campos 10px. | Vigente | — |
| D-037 | 2026-10-20 | Captura de áreas del walkthrough: formulario rápido en pantalla (Tipo, Nombre, Tamaño, condición Buena / Regular / Mala, botones Foto y Guardar y otra). | Vigente | — |
| D-038 | 2026-10-20 | Selector de días de la frecuencia semanal: botones con nombre corto (Lun, Mar, Mié, Jue, Vie, Sáb, Dom). | Vigente | — |
| D-039 | 2026-10-20 | Fotos de cada área: carrusel de miniaturas de 96px con nota por foto y botón Tomar foto. | Vigente | — |
| D-040 | 2026-10-20 | Portal del quote, código de verificación: 6 casillas con teclado numérico propio en pantalla (teclas Reenviar y Borrar). | Vigente | — |
| D-041 | 2026-10-20 | Portal del quote, SOW: documento adjunto que se abre con un botón de texto "Leer SOW (PDF)". No se dibuja dentro de la app. | Vigente | — |
| D-042 | 2026-10-20 | Portal del quote: el botón Continuar aparece bloqueado (con candado) y un aviso "Abre el SOW para poder continuar"; se activa al abrir el SOW. | Vigente | — |
| D-043 | 2026-10-20 | Portal del quote, precio: cuota mensual grande arriba (26px), vigencia debajo y desglose Subtotal, Tax y Total mensual abajo. | Vigente | — |
| D-044 | 2026-10-20 | Portal del quote, decisión: barra inferior fija con botón Aceptar cotización y menú Más opciones (Negociar, Rechazar). | Vigente | — |
| D-045 | 2026-10-20 | Portal del quote, aceptación: resumen de lo que acepta (sitio y total mensual), campos Nombre completo y Cargo, casilla de confirmación de lectura del SOW y términos, y botón Aceptar cotización. | Vigente | — |
| D-046 | 2026-10-20 | Portal del quote, rechazo o negociación: motivos rápidos en fichas y campo Nota opcional. | Vigente | — |
| D-047 | 2026-10-20 | Portal del quote, pantalla final: marca de éxito y tarjeta de resumen con sitio, versión, fecha y hora, y nombre de quien aceptó. | Vigente | — |
