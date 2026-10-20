# Survey visual, ronda 6: gestión del admin en Operaciones

Fecha: 2026-10-20. Respuesta del dueño, textual:

> Ronda 6 del survey visual. Detalle del jobsite: Pestañas bajo el encabezado. Estado del jobsite: Campo con lista desplegable. Perfil del empleado: Encabezado con pestañas. Permisos del empleado: Áreas desplegables con interruptores. Pago por jobsite: Control segmentado y campos debajo. Alerta de margen del jobsite: Barra de costo contra tarifa. Aviso del salario mínimo: Error bajo el campo.

## Elegido

| Aspecto | Elección | Valor exacto |
| --- | --- | --- |
| Detalle del jobsite | Pestañas bajo el encabezado | encabezado con nombre, ciudad, tarifa mensual y ficha de estado; pestañas Resumen, Documentos, Personal y Horario (la activa con subrayado de 2px en color de marca); filas de datos debajo |
| Estado del jobsite | Campo con lista desplegable | campo con contorno de 1px, esquinas de 12px, etiqueta "Estado" y flecha hacia abajo; opciones Activo, Pausado y Terminado |
| Perfil del empleado | Encabezado con pestañas | círculo de 48px con iniciales, nombre, tipo de trabajador y rol; pestañas Datos, Permisos y Pagos |
| Permisos del empleado | Áreas desplegables con interruptores | campo Plantilla de partida con el rol; cada área (Ventas, Clientes y jobsites, Empleados, Schedule y Work, Accounting, Sistema) se despliega y lista sus permisos con un interruptor de 40px por permiso (encendido en color de marca) |
| Pago por jobsite | Control segmentado y campos debajo | control Por hora / Tarifa fija con esquinas de 12px; por hora: campos Tarifa por hora y Horas garantizadas (opcional) y una línea de ejemplo del cálculo |
| Alerta de margen | Barra de costo contra tarifa | texto "Costo del personal" con las cifras; barra de 8px que se llena en ámbar `#B7791F`; ficha "Margen en riesgo" con contorno ámbar |
| Aviso del salario mínimo | Error bajo el campo | campo con borde de 1px en rojo `#C0504D` y debajo el texto "El mínimo para W-2 es $15.00 por hora." en rojo |

Notas de lo que las muestras no definieron y queda pendiente:

- Los permisos de las demás áreas (Clientes y jobsites, Empleados, Schedule y Work, Accounting, Sistema) siguen la lista de `current/flujo.md`; solo se mostró el área Ventas.
- Cómo se ve el pago con Tarifa fija (por visita, semana o mes) no se mostró.
- La muestra del salario mínimo mostraba el botón Guardar activo bajo el error; si queda bloqueado mientras haya error no se ha decidido.
- La alerta de margen se mostró como barra y ficha dentro del jobsite; dónde más aparece (por ejemplo, en la lista de jobsites) no se ha decidido.
- Los nombres y las cifras son de ejemplo.

Copia visual de lo aprobado: [`ronda-06-gestion-admin-aprobado.html`](ronda-06-gestion-admin-aprobado.html).

## Opciones mostradas y no elegidas

No se usan.

- **Detalle del jobsite:** secciones desplegables; una pantalla larga con tarjetas.
- **Estado del jobsite:** control segmentado; ficha tocable que abre opciones.
- **Perfil del empleado:** lista de secciones navegables; una pantalla larga con tarjetas.
- **Permisos:** lista con casillas y contador; fichas tocables por área.
- **Pago:** dos tarjetas de opción con campos dentro; selector de tipo de pago.
- **Alerta de margen:** tarjeta de alerta con cifras; ficha ámbar en la fila del jobsite.
- **Salario mínimo:** alerta arriba y Guardar bloqueado; texto fijo del mínimo bajo el campo.
