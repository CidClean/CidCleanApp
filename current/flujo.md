# Cid Clean — Flujo completo de la app

Versión vigente del flujo. Si algo cambia, se edita aquí y se registra en `../decisions.md`; la versión anterior pasa a `../archive/`.

## Visión general

La app cubre todo el ciclo de una cuenta de Cid Clean, del lead al profit, en dos sectores unidos por el Jobsite.

- **Ventas:** Lead → Walkthrough → Quote y SOW → Aceptación.
- **Operaciones:** Cliente y Jobsites, Empleados, Schedule, Work registration y Accounting.

Cuando se acepta el quote de un sitio nace el Cliente con su Jobsite. Desde ahí, horario, horas trabajadas y dinero cuelgan del Jobsite.

**Fuera de la app:** redacción del SOW y del contrato (la app los guarda), facturación y cobro (Accounting solo registra el ingreso), pago a empleados (la app solo calcula lo que se debe) y todo portal de cliente después de la aceptación del quote.

## Ventas 1: Lead

Un lead es una empresa con datos justos para hacer contacto, y su meta es conseguir una visita al sitio con el encargado.

- **Fuentes:** web, campañas de marketing y registro manual.
- **Datos:** empresa, persona de contacto, teléfono, email, fuente y notas. Nada más específico en esta etapa.
- **Estados:** Nuevo → Contactado → Walkthrough agendado → Walkthrough hecho → Quote enviado → Negociación → Ganado o Perdido (con motivo de la lista de partida, ver "Listas de partida").
- **Walkthrough agendado:** se registra como cita, no solo como estado.
- **Seguimiento:** el lead genera recordatorios de seguimiento.
- **Varios sitios:** un lead puede tener varios sitios, cada uno con su propio walkthrough y su propio quote.
- **Cliente existente con sitio nuevo:** el walkthrough se crea directo desde el cliente, sin pasar por lead, y entra al mismo flujo de walkthrough y quote.
- **Asignación:** por ahora solo el dueño hace los walkthroughs, así que los leads no se asignan.

## Ventas 2: Walkthrough

El walkthrough recoge la información específica de un sitio mientras se camina, y es la base del quote, el SOW y el contrato. Debe ser rápido: se toman notas sobre la marcha, un walkthrough por sitio.

1. **Sitio y contacto:** dirección, persona de contacto y datos generales del lugar.
2. **Áreas:** por cada área se captura type, nombre (por defecto `Type ##`, editable después), size, condición, special request, notas y fotos.
3. **Frecuencia:**
    - Diaria.
    - Semanal: se marcan los días (L M X J V S D). Dos días marcados significan dos veces por semana.
    - Más abierta, por ejemplo dos veces al mes: selector de días preferidos, como los días 1 y 15 de cada mes o viernes alternos.
4. **Notas internas (no salen al cliente):** personal necesario, tiempo estimado y suministros.
5. **Resumen:** revisión y corrección antes de cerrar. Al cerrar se genera el resumen descargable en PDF.

**Sin internet:** el walkthrough se llena completo en el sitio, fotos incluidas, y se sincroniza cuando haya señal.

## Ventas 3: Quote, SOW y portal del cliente

El quote se arma desde el walkthrough y se envía por email a un portal seguro donde el cliente decide. Hay un quote por sitio y su monto es mensual.

- **Contenido:** services, add-ons, descuentos y tax (tasa predeterminada de 6%, editable). Cada servicio y add-on lleva una casilla "gravable" que decide el dueño.
- **Envío:** por email, con acceso al portal mediante OTP.
- **SOW:** se crea fuera de la app, y la app lo guarda y lo adjunta al portal. El cliente está obligado a leerlo antes de poder decidir.
- **Descargas:** el cliente puede descargar el quote y el SOW.
- **Acepta:** se registran nombre y cargo de quien acepta.
- **Rechaza:** se pide el motivo, de la misma lista que los motivos de lead perdido, y una nota opcional.
- **Negociación:** se envía una nueva versión (1.1, 1.2...) y las anteriores quedan guardadas.
- **Vigencia:** 30 días por defecto, editable en cada quote. Al vencer pasa a Expirado, y el lead recuerda el seguimiento antes de que venza.
- **Contrato:** documento aparte, creado fuera de la app. La app lo retiene y lo guarda.

Cuando el cliente acepta el quote de un sitio, el lead pasa a Ganado y nace el Cliente con ese Jobsite.

## Operaciones 1: Cliente y Jobsite

Un Cliente puede tener varios Jobsites, y cada Jobsite es único. Los datos de contacto vienen del walkthrough.

Cada Jobsite guarda:

- Dirección, contacto principal y contacto de emergencia.
- Resumen del walkthrough, editable y versionado.
- SOW, editable y versionado.
- Contrato y documentos.
- Frecuencia del servicio.
- **Tarifa al cliente:** un monto total mensual, sin importar cuántos empleados vayan. El ingreso se registra cada mes.
- Estado: activo, pausado o terminado.

Si cambia el alcance de un Jobsite, se genera un quote nuevo.

## Operaciones 2: Empleados

Cada empleado tiene un perfil con su tipo de trabajador, sus permisos y su pago en cada jobsite donde trabaja.

**Perfil**

- Datos personales y tipo de trabajador: W-2 o 1099.
- Rol de partida (admin, supervisor, empleado), como plantilla de permisos.
- Si tiene acceso a la app. Si no, un supervisor o admin registra su trabajo.
- Idioma: inglés por defecto, o español.
- Los 1099 guardan sus documentos (W-9 y certificado de seguro).
- Al crear un empleado con acceso a la app se le envía la invitación sola; mientras no entre, su perfil lo muestra y permite reenviarla (D-172). Desactivarlo conserva su historial (D-173).

**Pago por jobsite** (un mismo empleado puede tener pagos distintos en varios jobsites)

- **Por hora**, con horas garantizadas opcionales. Con 3 h garantizadas a $18/h, si trabaja 2.2 h se le pagan 3 h. Si trabaja más de 3 h, se le paga lo real.
- **Tarifa fija**, por visita, por semana o por mes.

**Alertas**

- **Margen:** salta cuando el costo proyectado de todo el personal de un jobsite iguala o supera lo que cobra el cliente. No hay porcentaje mínimo, y suministros y equipo no entran en esta alerta.
- **Salario mínimo:** a un empleado W-2 pagado por hora no se le puede asignar menos de $15/h, el mínimo de Florida desde el 30 de septiembre de 2026.
- **Horas semanales:** no se permiten horas extra. La app avisa antes de llegar a 32 h semanales, sumando todos los jobsites. Aplica a todo el staff, W-2 y 1099.

## Operaciones 3: Schedule y Work registration

El Schedule es lo planificado y el Work es lo realmente trabajado. Son independientes: que Staff A esté programado no garantiza que sea quien trabaje.

**Schedule**

- Cada jobsite genera sus visitas según su frecuencia: fecha, hora y empleados asignados.
- Se edita en cualquier momento (cambios y reemplazos).
- Los empleados ven solo la semana actual y la siguiente, aunque haya horario más adelante, y reciben aviso si algo cambia.
- Las visitas siempre se realizan. Si una no va a hacerse, se quita del schedule, así que no existe el estado "no realizada".

**Work registration**

- Solo se registra sobre una visita programada. La lista de empleados parte de lo programado y se ajusta. Ejemplo: programados A, B y C, trabajaron A, C y D.
- Cada empleado hace clock in y clock out desde la app. Si no tiene acceso, un supervisor o admin registra por él.
- **GPS:** el clock in se valida contra la dirección del jobsite. Si falla o queda fuera de rango, se permite y queda marcado para revisión del admin.
- **Aprobación:** el admin revisa y aprueba. Solo el trabajo aprobado cuenta para nómina y Accounting.
- Al aprobar, la app calcula el pago de cada empleado: horas reales, horas garantizadas o tarifa fija.

## Operaciones 4: Accounting

Accounting registra ingresos, costo de personal y gastos, globales y por cuenta (una cuenta es un jobsite), y los resume en un dashboard.

- **Ingresos:** cada mes se registra el ingreso esperado de cada jobsite. Al recibirlo se marca como recibido con la fecha real. El ingreso cuenta en el mes en que se registra, no en el que se cobra, y el dashboard muestra lo recibido y lo pendiente.
- **Personal:** el costo sale automático del trabajo aprobado (horas reales, garantizadas o tarifa fija), agrupado por mes, empleado y jobsite. La app calcula lo que se debe y no registra si ya se pagó.
- **Gastos:** categoría, fecha y monto. Pueden ser de un jobsite o globales de Cid Clean. Los registra quien tenga el permiso, por defecto el dueño y los administradores.
- **Gastos recurrentes:** seguro, vehículos y software se configuran una vez y se generan solos cada mes. Cada uno se puede pausar.
- **Dashboard:** ingresos, personal, gastos y profit, vistos de forma global, por cuenta y por periodo.

La facturación al cliente se maneja fuera de la app.

## Roles y permisos

Los permisos se marcan uno por uno al crear el perfil de cada miembro del staff. El rol (Admin, Supervisor, Empleado) es solo una plantilla de partida que se puede ajustar: un admin puede quedar sin acceso a lo que se cobra por cuenta, por ejemplo.

Solo hay un **Super Admin**, con todos los permisos. Nadie puede dar un permiso que no tiene, y gestionar permisos es en sí un permiso.

| Área | Permisos |
| --- | --- |
| Ventas | Ver, crear-editar y eliminar leads · hacer walkthroughs · ver, crear-editar y enviar quotes · ver precios de los quotes · subir y ver SOW y contratos |
| Clientes y jobsites | Ver clientes y jobsites · editar datos y contactos · editar walkthrough y SOW (versionados) · ver tarifa al cliente · cambiar estado |
| Empleados | Ver lista · invitar y crear · editar y desactivar · ver pagos y tarifas · asignar a jobsites y definir su pago · gestionar permisos · gestionar documentos de empleados |
| Schedule y Work | Ver y editar el schedule completo · registrar trabajo por otros · editar registros de trabajo · aprobar trabajo · revisar alertas de GPS |
| Accounting | Ver y registrar ingresos y marcarlos como recibidos · ver costo de personal · ver, registrar y editar gastos · gestionar gastos recurrentes · ver dashboard global · ver dashboard por cuenta · exportar reportes |
| Sistema | Configuración general (vigencia de quotes, categorías de gastos, motivos de lead perdido; solo el Super Admin) · ver historial de cambios · transferir el rol de Super Admin (solo el Super Admin) |

Todo empleado puede ver su propio horario (semana actual y siguiente) y hacer su clock in y clock out, sin necesitar permisos adicionales.

## Notificaciones

Cada notificación llega solo a quien tiene el permiso relacionado. Cada persona elige en su perfil por qué canal las recibe: push, email o dentro de la app.

| Área | Notificaciones |
| --- | --- |
| Ventas | Seguimiento de lead pendiente · walkthrough agendado · quote por vencer o expirado · quote visto, aceptado o rechazado · nueva versión solicitada |
| Schedule | Horario nuevo o cambiado · visita en las próximas horas · empleado sin confirmar o removido |
| Work | Trabajo pendiente de aprobar · clock in con GPS fuera de rango · clock in o out olvidado · trabajo aprobado |
| Accounting | Ingreso esperado sin marcar como recibido · alerta de margen · gasto recurrente generado |
| Empleados | Alerta de 32 h semanales · pago por hora por debajo del mínimo |
| Sistema | Invitación de staff · cambio de permisos · nueva versión de términos y condiciones por aceptar |

## Legal y términos y condiciones (Florida)

Cid Clean opera en Naples, Florida (Collier County). Esta sección no es asesoría legal: lo que sigue se confirma con un CPA o abogado.

- **Sales tax:** la limpieza de edificios no residenciales es un servicio gravable en Florida, con 6% estatal. Collier no tiene recargo de condado. En la app, cada servicio y add-on del quote lleva una casilla "gravable" que decide el dueño. La app no automatiza exenciones.
- **Salario mínimo:** $15/h desde el 30 de septiembre de 2026. La app alerta si a un empleado W-2 pagado por hora se le asigna menos.
- **W-2 y 1099:** ambos tipos conviven, y cada perfil lleva el suyo. En Florida pesa cómo se trata realmente al trabajador, no lo que diga el contrato.

**Términos y condiciones**

Los redacta un abogado fuera de la app. La app los guarda versionados y registra quién aceptó qué versión y cuándo. Son tres documentos:

1. **Portal del cliente:** aceptación electrónica y uso del OTP. Se registra junto a cada quote aceptado: nombre, cargo, fecha y hora, IP, versión del quote y confirmación de lectura del SOW.
2. **Staff:** consentimiento de uso de GPS (solo en clock in y clock out), fotos y datos personales. Se acepta en el primer ingreso y de nuevo si cambia la versión. Las versiones y las aceptaciones se guardan en la base de datos; no se pide aceptar hasta que haya una versión publicada, y no se le pide al Super Admin. Cada versión es un PDF del abogado que sube el Super Admin, y el staff lo lee como PDF (D-176).
3. **Privacidad y emails:** baja de comunicaciones y dirección física en los emails a leads.

Sources: [FL DOR, sales tax on cleaning services](https://floridarevenue.com/forms_library/current/gt800015.pdf) · [Rule 12A-1.0091](https://floridasalestax.com/florida-sales-tax-rules/12a-1-0091) · [Florida county surtax rates 2026](https://www.floridasalestax.com/florida-tax-law-blog/2026/august/florida-county-surtax-rates-for-2026-the-complet/) · [Florida minimum wage $15](https://www.hrmorning.com/news/florida-minimum-wage/) · [Worker classification in Florida](https://www.epgdlaw.com/?p=598)

## Listas de partida

- **Tipos de área del walkthrough:** Baño, Oficina, Lobby, Cocina, Sala de juntas, Pasillo, Recepción, Escaleras, Almacén y Otro.
- **Motivos de lead perdido:** Precio, Eligió a otra compañía, Sin respuesta, Ya no necesita el servicio, Cambió el alcance, Trabajo muy grande o muy pequeño, Fuera de la zona de servicio y Otro. Se editan en Ajustes y la misma lista sirve para el rechazo del quote.
- **Categorías de gastos (D-130):** Suministros, Equipo, Seguro, Vehículos, Software y Otro. Se editan en Ajustes.

## Pendientes del inicio

El inicio muestra solo los pendientes de las áreas donde la persona tiene permiso, ordenados por lo más urgente. Es Urgente (D-131) un quote que vence en 3 días o menos, un trabajo por aprobar con más de 1 día de espera, un trabajo con GPS fuera de rango y un jobsite con margen en riesgo.

## Reglas transversales y alcance

**Reglas que aplican a toda la app**

- **Idioma:** inglés y español, con inglés por defecto.
- **Sin internet:** el walkthrough funciona sin conexión y sincroniza después.
- **Versionado:** walkthrough, SOW, quotes y términos y condiciones guardan sus versiones anteriores.
- **Auditoría:** historial de cambios visible para quien tenga el permiso. Registra los cambios importantes (tarifas, permisos, estados y aprobaciones) y cada vez que alguien abre tarifas o documentos sensibles.
- **Permisos:** todo acceso y toda notificación dependen de los permisos del perfil.

**Fuera de esta versión**

- Redacción del SOW y del contrato.
- Facturación y cobro al cliente.
- Registro del pago a empleados.
- Datos de acceso físico al jobsite (llaves, códigos, parking).
- Checklist de tareas por visita.
- Renovaciones y fechas de fin de contrato.
- Portal del cliente después de la aceptación del quote.

## Próximos pasos

1. **Survey visual:** varias opciones por cada detalle de la app, hasta los más pequeños (esquinas de botones, colores, tipografía).
2. **Survey de seguridad.**
3. **Arquitectura:** se escoge al final, con todo lo anterior definido.
