# Survey visual, ronda 12: pendientes restantes

Fecha: 2026-10-20. Respuesta del dueño, textual:

> Ronda 12 del survey visual. Pago con tarifa fija: Campo desplegable Cobra por y campo Monto. Qué es una cuenta en Accounting: Un jobsite. Dashboard por cuenta: Selector de cuenta y las mismas cuatro tarjetas. Crear y editar un gasto recurrente: El mismo formulario con interruptor Activo para pausarlo. Calendario del mes completo: Mes completo con puntos en los días que ya tienen citas. Frecuencia Diaria: Tipo Diaria con los siete días marcados. Tipos de área del walkthrough: Diez tipos: los siete más Recepción, Escaleras y Almacén. Motivos de lead perdido para empezar: Ocho motivos: los cinco más Cambió el alcance, Trabajo muy grande o muy pequeño y Fuera de la zona. Motivos de rechazo del quote: La misma lista que los motivos de lead perdido. Botón Editar del trabajo por aprobar: Un lápiz en cada fila que abre las horas de ese empleado. Áreas de permisos cerradas: Nombre y ficha Todo, Parcial o Sin acceso. Pendientes del inicio según permisos: Una sola lista ordenada por lo más urgente. Pantalla de la vigencia de los quotes: Botones menos y más con el número en el centro. Editar las listas de Ajustes: Lista con lápiz y papelera por fila y botón Agregar. Quién edita Ajustes: Solo el Super Admin. Qué aparece en el historial: Solo cambios importantes: tarifas, permisos, estados y aprobaciones. Confirmación extra al transferir el Super Admin: Solo la casilla y el botón. Cuándo una notificación pasa a leída: Al tocarla. Qué hace tocar una notificación: Abre directamente la pantalla relacionada. Aviso al terminar de sincronizar: Una nube con marca de verificación que se queda. Librería de iconos: Tabler Icons.

## Cambios a decisiones anteriores

Tres decisiones quedan Reemplazadas, con sus versiones anteriores en `../archive/diseno-visual-2026-10-20-antes-de-ronda-12.md` y `../archive/flujo-2026-10-20-antes-de-ronda-12.md`:

- **D-099 → D-107.** Los motivos de lead perdido pasan de una lista corta de "5 motivos" a ocho motivos de partida.
- **D-092 → D-109.** El detalle de un trabajo por aprobar tenía un botón Editar para todo el trabajo; ahora cada fila lleva un lápiz. La barra fija de abajo queda solo con Aprobar.
- **D-081 → D-111.** Los pendientes del inicio eran filas con contador; ahora son una sola lista por urgencia. Las cifras del mes de arriba (Ingresos y Profit) se mantienen.

`current/flujo.md` cambia en cinco puntos: una cuenta es un jobsite; los gastos recurrentes se pueden pausar; la configuración general la edita solo el Super Admin; el historial registra solo los cambios importantes; y se agrega la sección "Listas de partida" (tipos de área y motivos de lead perdido, que también sirven para el rechazo del quote).

## Elegido

| Aspecto | Elección | Decisión |
| --- | --- | --- |
| Pago con tarifa fija | Campo desplegable Cobra por y campo Monto | D-100 |
| Qué es una cuenta | Un jobsite | D-101 |
| Dashboard por cuenta | Selector de cuenta y las mismas cuatro tarjetas | D-102 |
| Gasto recurrente | El mismo formulario con interruptor Activo para pausarlo | D-103 |
| Calendario del mes | Mes completo con puntos en los días que ya tienen citas | D-104 |
| Frecuencia Diaria | Tipo Diaria con los siete días marcados | D-105 |
| Tipos de área | Diez tipos: Baño, Oficina, Lobby, Cocina, Sala de juntas, Pasillo, Recepción, Escaleras, Almacén y Otro | D-106 |
| Motivos de lead perdido | Ocho motivos (lista exacta en D-107) | D-107 |
| Motivos de rechazo del quote | La misma lista que los de lead perdido | D-108 |
| Editar un trabajo por aprobar | Un lápiz en cada fila que abre las horas de ese empleado | D-109 |
| Áreas de permisos cerradas | Nombre y ficha Todo, Parcial o Sin acceso | D-110 |
| Pendientes del inicio | Una sola lista ordenada por lo más urgente | D-111 |
| Vigencia de los quotes | Botones − y + con el número en el centro | D-112 |
| Editar listas de Ajustes | Lista con lápiz y papelera por fila y botón Agregar | D-113 |
| Quién edita Ajustes | Solo el Super Admin | D-114 |
| Historial | Solo cambios importantes: tarifas, permisos, estados y aprobaciones | D-115 |
| Confirmación al transferir el Super Admin | Solo la casilla y el botón | D-116 |
| Notificación leída | Al tocarla | D-117 |
| Tocar una notificación | Abre directamente la pantalla relacionada | D-118 |
| Aviso al terminar de sincronizar | Nube con marca de verificación que se queda | D-119 |
| Librería de iconos | Tabler Icons (trazo 1.5px) | D-120 |

Los valores exactos de cada pantalla (campos, textos, tamaños) están en `../decisions.md` y en `../current/diseno-visual.md`.

Notas de lo que las muestras no definieron y queda pendiente:

- **Confirmado por el dueño (D-121):** el lápiz por fila reemplaza al botón Editar (D-109) y las cifras del mes se mantienen arriba en el inicio (D-111).
- Las categorías de gastos concretas no están decididas (las muestras usaban Suministros, Seguro y Vehículos solo de ejemplo). Falta también el formulario al tocar Agregar o el lápiz en una lista de Ajustes.
- Qué hace que un pendiente del inicio sea Urgente (por ejemplo, un quote a pocos días de vencer).
- Cuáles son los cuatro iconos de la barra inferior y qué icono de Tabler va en cada función (se eligen al construir).
- Qué cambios exactos cuentan como "importantes" en el historial más allá de tarifas, permisos, estados y aprobaciones.
- Los nombres, textos y cifras son de ejemplo.

## Confirmaciones del dueño después de la ronda

Mismo día, 19:09. Respuesta del dueño, textual:

> 1. Si
> 2. Correcto
>
> * ponlas en settings yambien
> * no se dímelo tu
> * pipieline, cuantas, inicio y menú
> * nos e a que te refieres pero es simple deja la casilla de marcar si es Tax o no

Registrado: "Si" y "Correcto" a las dos cosas por confirmar (D-121). La última línea, sobre el Tax, se registra como "se queda como está" (D-122), porque el quote ya lleva la tasa de 6% editable y la marca Gravable por renglón.

Sin registrar, por falta de claridad o porque son propuestas (se preguntó al dueño):

- "ponlas en settings y también" (sobre las categorías de gastos concretas): la frase quedó cortada. Las categorías ya se editan en Ajustes (D-113 y D-114); falta saber qué sigue después de "y también".
- "no sé, dímelo tú" (sobre qué hace Urgente a un pendiente del inicio): es una propuesta pendiente de aprobación; no entra a `current/` hasta que el dueño la confirme.
- "pipeline, cuantas, inicio y menú" (cuatro iconos de la barra inferior): falta confirmar si "cuantas" se refiere a Cuentas y qué abre cada una, además del orden.

Copia visual de lo aprobado: [`ronda-12-pendientes-restantes-aprobado.html`](ronda-12-pendientes-restantes-aprobado.html).

## Opciones mostradas y no elegidas

No se usan.

- **Tarifa fija:** tres botones Visita, Semana y Mes; campo de monto con la unidad dentro.
- **Cuenta:** un cliente con todos sus jobsites; cliente o jobsite a elegir.
- **Dashboard por cuenta:** lista de cuentas con su profit; tarjetas apiladas por cuenta.
- **Gasto recurrente:** formulario sin interruptor; hoja inferior sobre la lista.
- **Calendario:** mes completo sin puntos; mes con las citas del día debajo.
- **Diaria:** solo la línea de veces por semana; casilla para incluir sábado y domingo.
- **Tipos de área:** cinco tipos; siete tipos.
- **Motivos de lead perdido:** cuatro motivos; cinco motivos.
- **Motivos de rechazo:** Precio, Alcance, Frecuencia y Otro; Precio, Eligió a otra compañía, Ya no lo necesita y Otro.
- **Editar un trabajo:** pantalla con horas de todos; hoja inferior para un empleado.
- **Permisos cerrados:** contador de permisos activos; solo el nombre y la flecha.
- **Inicio:** solo las filas con permiso; filas agrupadas por área.
- **Vigencia:** campo de número; fichas de 15, 30, 45 y 60 días.
- **Listas de Ajustes:** fichas con x; al tocar una fila se abre su nombre.
- **Quién edita:** quien tenga el permiso Configuración general; un permiso aparte.
- **Historial:** todos los cambios sin filtros; todos con fichas de área.
- **Transferir Super Admin:** escribir TRANSFERIR; código al correo.
- **Notificación leída:** al abrir la bandeja; al tocarla con botón Marcar todo como leído.
- **Tocar una notificación:** detalle corto con botón Ver; fila que se abre con botón de acción.
- **Sincronizado:** aviso temporal; sin aviso.
- **Iconos:** Lucide; Phosphor Light.
