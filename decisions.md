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
| D-048 | 2026-10-20 | Horario del empleado: tira de 7 días con la lista de visitas del día elegido. | Vigente | — |
| D-049 | 2026-10-20 | Marcar entrada (clock in): deslizar para marcar, con "Ubicación lista" visible. | Vigente | — |
| D-050 | 2026-10-20 | Pantalla durante el turno: cronómetro grande (34px), hora de entrada y botón Marcar salida. | Vigente | — |
| D-051 | 2026-10-20 | Si el GPS no coincide con el sitio: se muestra la distancia al sitio y los botones Reintentar ubicación y Marcar de todos modos. | Vigente | — |
| D-052 | 2026-10-20 | Registro del trabajo por supervisor o admin: una fila por empleado con hora de entrada y de salida editables, y botón Guardar. | Vigente | — |
| D-053 | 2026-10-20 | Trabajos por aprobar: lista con ficha de estado; al tocar una fila se abre el detalle. | Vigente | — |
| D-054 | 2026-10-20 | GPS fuera de rango visto por el admin: ficha ámbar "GPS fuera de rango" en la fila del trabajo. | Vigente | — |
| D-055 | 2026-10-20 | Detalle del jobsite: encabezado con nombre, ciudad, tarifa mensual y estado, y pestañas Resumen, Documentos, Personal y Horario. | Vigente | — |
| D-056 | 2026-10-20 | Estado del jobsite (activo, pausado, terminado): campo con lista desplegable. | Vigente | — |
| D-057 | 2026-10-20 | Perfil del empleado: encabezado con iniciales, nombre, tipo de trabajador y rol, y pestañas Datos, Permisos y Pagos. | Vigente | — |
| D-058 | 2026-10-20 | Permisos del empleado: campo Plantilla de partida y áreas desplegables con un interruptor por permiso. | Vigente | — |
| D-059 | 2026-10-20 | Pago por jobsite: control segmentado Por hora / Tarifa fija con los campos debajo (tarifa por hora y horas garantizadas opcionales). | Vigente | — |
| D-060 | 2026-10-20 | Alerta de margen del jobsite: barra de costo del personal contra tarifa al cliente, en ámbar, con ficha "Margen en riesgo". | Vigente | — |
| D-061 | 2026-10-20 | Aviso del salario mínimo: error bajo el campo (borde y texto en rojo `#C0504D`). | Vigente | — |
| D-062 | 2026-10-20 | Los gastos de Accounting no llevan foto del recibo: solo categoría, fecha y monto. | Vigente | Texto de gastos en `current/flujo.md` (incluía foto del recibo; no tenía decisión propia, ver `archive/flujo-2026-10-20-con-foto-de-recibo.md`) |
| D-063 | 2026-10-20 | Accounting, ingresos del mes: resumen arriba (Esperado y Recibido con barra de avance) y lista de ingresos con ficha de estado debajo. | Vigente | — |
| D-064 | 2026-10-20 | Marcar un ingreso como recibido: interruptor Recibido en la fila, con el campo Fecha de cobro. | Vigente | — |
| D-065 | 2026-10-20 | Registro de un gasto: control Global / Jobsite al inicio, con selector de jobsite, categoría y monto. | Vigente | — |
| D-066 | 2026-10-20 | Gastos recurrentes: lista con nombre, frecuencia y monto. | Vigente | — |
| D-067 | 2026-10-20 | Costo de personal: control Por empleado / Por jobsite con lista de horas y monto. | Vigente | — |
| D-068 | 2026-10-20 | Dashboard: cuatro tarjetas de cifras (Ingresos, Personal, Gastos, Profit) y línea de Recibido y Pendiente. | Vigente | — |
| D-069 | 2026-10-20 | Filtros del dashboard: control Global / Por cuenta y selector de mes con flechas. | Vigente | — |
| D-070 | 2026-10-20 | Detalle del lead: encabezado con empresa, fuente y estado, y pestañas Datos, Sitios y Notas. | Vigente | — |
| D-071 | 2026-10-20 | Estado del lead: campo con lista desplegable con los estados del flujo. | Vigente | — |
| D-072 | 2026-10-20 | Agendar el walkthrough: calendario del mes con el día elegido resaltado, campo de hora y botón Agendar. | Vigente | — |
| D-073 | 2026-10-20 | Walkthrough: se recorre por pasos con barra de progreso (Sitio y contacto, Áreas, Frecuencia, Notas internas, Resumen) y botones Atrás y Siguiente. | Vigente | — |
| D-074 | 2026-10-20 | Datos de cada área: campo desplegable Tipo y campos de texto visibles Nombre, Pedido especial y Notas. | Vigente | — |
| D-075 | 2026-10-20 | Frecuencia del servicio: campo desplegable de tipo con los botones de día debajo y la línea de veces por semana. | Vigente | — |
| D-076 | 2026-10-20 | Armado del quote: secciones Servicios, Add-ons y Descuentos con renglones (nombre, Gravable y monto) y Total mensual al final. | Reemplazada (por D-077) | — |
| D-077 | 2026-10-20 | Armado del quote: secciones Servicios, Add-ons y Descuentos; cada renglón de servicio o add-on con su nombre, el monto y un interruptor Gravable; al final Subtotal, Tax (sobre lo gravable) y Total mensual. | Vigente | D-076 (el renglón mostraba "Gravable" solo como texto y no había líneas de Subtotal y Tax) |
| D-078 | 2026-10-20 | Elegir el sitio al agendar un walkthrough: campo desplegable de sitio arriba, y después el calendario y la hora. | Vigente | — |
| D-079 | 2026-10-20 | Marcar un lead como perdido: campo desplegable de motivo, nota opcional y botón Marcar como perdido. | Vigente | — |
| D-080 | 2026-10-20 | Frecuencia más abierta: en el campo desplegable de tipo se elige Otra y se describe en un campo de texto libre (por ejemplo, "Días 1 y 15 de cada mes"). | Vigente | — |
| D-081 | 2026-10-20 | Pantalla de inicio del admin: cifras del mes (Ingresos y Profit) arriba y lista de pendientes con contadores debajo. | Reemplazada (por D-111) | — |
| D-082 | 2026-10-20 | Lista de jobsites: agrupada por cliente, con tarifa mensual y ficha de estado por jobsite. | Vigente | — |
| D-083 | 2026-10-20 | Lista de empleados: lista compacta con iniciales, nombre, tipo de trabajador y rol, y ficha de estado. | Vigente | — |
| D-084 | 2026-10-20 | Bandeja de notificaciones: lista con título, detalle y hora; un punto de color de marca marca las no leídas. | Vigente | — |
| D-085 | 2026-10-20 | Canales de notificación por persona: pantalla Mis notificaciones con tres interruptores globales (Push, Email, En la app) que valen para todas las áreas. | Vigente | — |
| D-086 | 2026-10-20 | Términos del staff en el primer ingreso (y cuando cambia la versión): pantalla Antes de empezar con tres puntos resumidos (ubicación solo al marcar entrada y salida, fotos del trabajo, datos personales), enlace Leer los términos completos, casilla "He leído y acepto los términos" y botón Aceptar. | Vigente | — |
| D-087 | 2026-10-20 | Idioma de la app: control segmentado English / Español en Mi perfil. | Vigente | — |
| D-088 | 2026-10-20 | Historial de cambios: lista cronológica simple, cada fila con quién hizo qué y cuándo. | Vigente | — |
| D-089 | 2026-10-20 | Ajustes del sistema: lista de ajustes que se abren (Vigencia de los quotes, Categorías de gastos), cada uno con su valor actual y una flecha. | Reemplazada (por D-099) | — |
| D-090 | 2026-10-20 | Transferir el rol de Super Admin: selector Nuevo Super Admin, casilla "Entiendo que dejaré de ser Super Admin" y botón Transferir rol. | Vigente | — |
| D-091 | 2026-10-20 | Aviso sin conexión: icono de nube con contador de pendientes ("3 pendientes") en el encabezado de la pantalla. | Vigente | — |
| D-092 | 2026-10-20 | Detalle de un trabajo por aprobar: encabezado con sitio y día, resumen (empleados y horas en total), una fila por empleado con su horario y horas (con ficha ámbar "GPS fuera de rango" si aplica) y, fija abajo, la barra con los botones Editar y Aprobar. | Reemplazada (por D-109) | — |
| D-093 | 2026-10-20 | Semana siguiente en el horario del empleado: control segmentado Esta semana / Próxima semana arriba de la tira de días. | Vigente | — |
| D-094 | 2026-10-20 | Menú Más opciones del portal del quote: menú con Negociar ("Pedir cambios al precio o al alcance") y Rechazar ("No aceptar la cotización"), cada opción con una línea de explicación. | Vigente | — |
| D-095 | 2026-10-20 | La casilla que confirma la lectura del SOW se pide solo al aceptar; Negociar y Rechazar no la piden. | Vigente | — |
| D-096 | 2026-10-20 | Salario mínimo al guardar el pago: el botón Guardar queda activo; si la tarifa de un W-2 es menor a $15.00 por hora, al tocarlo no guarda y muestra el error bajo el campo (D-061). | Vigente | — |
| D-097 | 2026-10-20 | La alerta de margen se ve además en la lista de jobsites, con la ficha ámbar "Margen en riesgo" en la fila del jobsite. | Vigente | — |
| D-098 | 2026-10-20 | Fecha del gasto: campo de texto Fecha debajo de Categoría y antes de Monto. | Vigente | — |
| D-099 | 2026-10-20 | Motivos de un lead perdido: lista corta que se edita en Ajustes, con una tercera fila "Motivos de lead perdido" (con la cantidad de motivos) en la lista de Ajustes del sistema. | Reemplazada (por D-107) | D-089 (Ajustes tenía solo Vigencia de los quotes y Categorías de gastos) |
| D-100 | 2026-10-20 | Pago con tarifa fija: con el control Tarifa fija elegido, campo desplegable Cobra (Por visita, Por semana o Por mes), campo Monto y una línea que explica el pago (por ejemplo, "Se pagan $120.00 por cada visita trabajada."). | Vigente | — |
| D-101 | 2026-10-20 | En Accounting, una cuenta es un jobsite: Por cuenta muestra un jobsite a la vez. | Vigente | — |
| D-102 | 2026-10-20 | Dashboard por cuenta: con Por cuenta elegido, selector de cuenta (jobsite), las mismas cuatro tarjetas (Ingresos, Personal, Gastos, Profit) y la línea de Recibido y Pendiente. | Vigente | — |
| D-103 | 2026-10-20 | Gasto recurrente: formulario en pantalla con Nombre, Categoría, control Global / Jobsite, Monto, "Se genera el día" (1 de cada mes), interruptor Activo para pausarlo y botón Guardar. | Vigente | — |
| D-104 | 2026-10-20 | Calendario del walkthrough: mes completo con flechas para cambiar de mes, puntos en los días que ya tienen citas y el día elegido resaltado, campo Hora y botón Agendar. | Vigente | — |
| D-105 | 2026-10-20 | Frecuencia Diaria: tipo Diaria con los siete botones de día marcados y la línea "7 veces por semana". | Vigente | — |
| D-106 | 2026-10-20 | Tipos de área del walkthrough: Baño, Oficina, Lobby, Cocina, Sala de juntas, Pasillo, Recepción, Escaleras, Almacén y Otro. | Vigente | — |
| D-107 | 2026-10-20 | Motivos de lead perdido: ocho de partida (Precio, Eligió a otra compañía, Sin respuesta, Ya no necesita el servicio, Cambió el alcance, Trabajo muy grande o muy pequeño, Fuera de la zona de servicio y Otro), que se editan en Ajustes; la lista de Ajustes del sistema lleva la tercera fila "Motivos de lead perdido" con la cantidad de motivos. | Vigente | D-099 (decía "lista corta" de "5 motivos"; ahora son ocho) |
| D-108 | 2026-10-20 | Motivos de rechazo del quote: la misma lista que los motivos de lead perdido, con nota opcional. | Vigente | — |
| D-109 | 2026-10-20 | Detalle de un trabajo por aprobar: encabezado con sitio y día, resumen (empleados y horas en total), una fila por empleado con su horario y horas, un lápiz en cada fila que abre las horas de ese empleado (y la ficha ámbar "GPS fuera de rango" si aplica) y, fija abajo, la barra con el botón Aprobar. | Vigente | D-092 (tenía un botón Editar para todo el trabajo; ahora se edita con el lápiz de cada fila) |
| D-110 | 2026-10-20 | Áreas de permisos cerradas: cada fila con el nombre del área y una ficha Todo (en color de marca), Parcial (verde) o Sin acceso (gris). | Vigente | — |
| D-111 | 2026-10-20 | Pantalla de inicio del admin: cifras del mes (Ingresos y Profit) arriba y debajo una sola lista de pendientes, ordenada por lo más urgente, solo con las áreas donde la persona tiene permiso; cada fila con título y detalle, y ficha ámbar Urgente o flecha. | Vigente | D-081 (los pendientes eran filas con contador) |
| D-112 | 2026-10-20 | Vigencia de los quotes en Ajustes: botones − y + de 44px con el número de días en el centro (por ejemplo, "30 días") y botón Guardar. | Vigente | — |
| D-113 | 2026-10-20 | Editar las listas de Ajustes (categorías de gastos y motivos): lista con lápiz y papelera en cada fila y botón Agregar. | Vigente | — |
| D-114 | 2026-10-20 | Ajustes del sistema (vigencia de los quotes, categorías de gastos y motivos): solo el Super Admin los edita. | Vigente | — |
| D-115 | 2026-10-20 | Historial de cambios: registra solo los cambios importantes (tarifas, permisos, estados y aprobaciones). | Vigente | — |
| D-116 | 2026-10-20 | Transferir el rol de Super Admin: sin confirmación extra, solo la casilla de confirmación y el botón (D-090). | Vigente | — |
| D-117 | 2026-10-20 | Una notificación pasa a leída al tocarla; el punto desaparece. | Vigente | — |
| D-118 | 2026-10-20 | Tocar una notificación abre directamente la pantalla relacionada; la fila lleva una flecha. | Vigente | — |
| D-119 | 2026-10-20 | Aviso al terminar de sincronizar: en el encabezado, una nube con marca de verificación y la palabra "Sincronizado", que se queda. | Vigente | — |
| D-120 | 2026-10-20 | Librería de iconos: Tabler Icons, en línea fina de 1.5px (D-035). | Vigente | — |
| D-121 | 2026-10-20 | Confirmado por el dueño: el lápiz de cada fila reemplaza al botón Editar en el detalle de un trabajo por aprobar (D-109), y las cifras del mes (Ingresos y Profit) se mantienen arriba en el inicio del admin (D-111). | Vigente | — |
| D-122 | 2026-10-20 | Tax del quote: se queda como está, con la tasa de 6% editable y la marca Gravable en cada renglón de servicio o add-on (D-077). No hay cambios. | Vigente | — |
