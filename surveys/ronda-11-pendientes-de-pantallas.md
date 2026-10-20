# Survey visual, ronda 11: pantallas pendientes

Fecha: 2026-10-20. Respuesta del dueño, textual:

> Ronda 11 del survey visual. Detalle de un trabajo por aprobar: Resumen y filas por empleado, Aprobar fijo abajo. Semana siguiente en el horario del empleado: Control Esta semana / Próxima semana arriba de la tira. Menú Más opciones del portal del quote: Menú con una línea de explicación en cada opción. Casilla de lectura según la decisión del cliente: Solo al aceptar. Guardar con el salario mínimo: Guardar activo; al tocarlo no guarda y muestra el error. Dónde se ve la alerta de margen: Ficha Margen en riesgo en la lista de jobsites. Fecha del gasto: Fecha debajo de la categoría. Motivos de un lead perdido: Lista corta que el Super Admin edita en Ajustes.

## Cambio a una decisión anterior

La pantalla de Ajustes del sistema (D-089, ronda 10) tenía dos filas. D-099 la reemplaza: ahora tiene tres, con Motivos de lead perdido. D-089 queda marcada como Reemplazada. Las versiones anteriores de `current/diseno-visual.md` y de `current/flujo.md` (la configuración general ahora incluye los motivos de lead perdido) están en `../archive/diseno-visual-2026-10-20-antes-de-D-099.md` y `../archive/flujo-2026-10-20-antes-de-D-099.md`.

## Elegido

| Aspecto | Elección | Valor exacto |
| --- | --- | --- |
| Detalle de un trabajo por aprobar | Resumen y filas por empleado, Aprobar fijo abajo | encabezado "Sitio · Hoy"; línea gris "3 empleados · 10.5 h en total"; una fila por empleado con nombre, horario y horas, y flecha (o ficha ámbar "GPS fuera de rango"); barra fija abajo con botón de contorno Editar y botón sólido Aprobar |
| Semana siguiente | Control Esta semana / Próxima semana arriba de la tira | control segmentado de dos opciones (Esta semana activa) sobre la tira de 7 días y la lista del día elegido |
| Menú Más opciones | Menú con una línea de explicación en cada opción | menú con contorno de 1px y esquinas de 12px con Negociar ("Pedir cambios al precio o al alcance") y Rechazar ("No aceptar la cotización"); sobre la barra fija con el botón de 44px de tres puntos y Aceptar cotización |
| Casilla de lectura | Solo al aceptar | Aceptar pide la casilla de confirmación de lectura del SOW; Negociar y Rechazar no |
| Guardar con el salario mínimo | Guardar activo; al tocarlo no guarda y muestra el error | botón sólido Guardar activo; con $14.00 queda el campo con borde rojo `#C0504D` y el texto "El mínimo para W-2 es $15.00 por hora." |
| Alerta de margen | Ficha Margen en riesgo en la lista de jobsites | en la lista agrupada por cliente, la fila del jobsite lleva la ficha de contorno ámbar `#B7791F` "Margen en riesgo" en lugar de "Activo" |
| Fecha del gasto | Fecha debajo de la categoría | orden: control Global / Jobsite, Jobsite, Categoría, Fecha (por ejemplo "20 oct 2026"), Monto y botón Guardar |
| Motivos de un lead perdido | Lista corta que el Super Admin edita en Ajustes | en Ajustes del sistema, tercera fila "Motivos de lead perdido" con "5 motivos, editables" y flecha |

Notas de lo que las muestras no definieron y queda pendiente:

- **Pregunta abierta al dueño:** la opción elegida dice que el Super Admin edita los motivos. En `current/flujo.md` la configuración general es un permiso (cualquier perfil puede tenerlo). Falta confirmar si los motivos los edita solo el Super Admin o quien tenga el permiso de configuración general. Mientras tanto, `current/` dice solo que se editan en Ajustes, dentro de la configuración general.
- Los motivos concretos de la lista no están decididos: la muestra elegida solo dice "5 motivos". La lista corta de ejemplo mostrada (Precio, Eligió a otra compañía, Sin respuesta, Ya no necesita el servicio, Otro) no se eligió y no está registrada.
- Cómo se abre y se edita la pantalla de motivos (agregar, quitar, cambiar el nombre).
- La alerta de margen sigue llegando como notificación según `current/flujo.md`; la ronda no agregó una fila en el inicio del admin.
- Qué abre el botón Editar del detalle de un trabajo por aprobar (se supone la pantalla de D-052, sin decidir).
- Los nombres, textos y cifras son de ejemplo.

Copia visual de lo aprobado: [`ronda-11-pendientes-de-pantallas-aprobado.html`](ronda-11-pendientes-de-pantallas-aprobado.html).

## Opciones mostradas y no elegidas

No se usan.

- **Detalle por aprobar:** filas que se abren con entrada, salida y GPS; pestañas Horas y GPS.
- **Semana siguiente:** flechas junto al título de la semana; la tira se desliza y sigue con la semana siguiente.
- **Menú Más opciones:** menú flotante junto al botón; hoja desde abajo con dos opciones y Cancelar.
- **Casilla de lectura:** al aceptar y al rechazar; en las tres decisiones.
- **Guardar con el salario mínimo:** Guardar bloqueado mientras el error esté visible; al guardar sube la tarifa a $15.00 y lo avisa.
- **Alerta de margen:** fila con contador en los pendientes del inicio; en la lista, en el inicio y como notificación.
- **Fecha del gasto:** fecha al final con hoy por defecto; campo de fecha con fichas Hoy y Ayer.
- **Motivos de perdido:** lista corta de cinco motivos; lista de ocho motivos.
