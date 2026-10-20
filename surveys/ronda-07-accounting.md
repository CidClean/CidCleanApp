# Survey visual, ronda 7: Accounting

Fecha: 2026-10-20. Respuesta del dueño, textual:

> Ronda 7 del survey visual. Ingresos del mes: Resumen arriba y lista debajo. Marcar un ingreso como recibido: Interruptor en la fila con fecha. Registro de un gasto: Control Global o Jobsite al inicio. Gastos recurrentes: Lista con monto y frecuencia. Costo de personal: Control Por empleado o Por jobsite. Dashboard: Cuatro tarjetas de cifras. Filtros del dashboard: Control Global o Por cuenta y mes con flechas. No necesitamos añadir foto de recibo asi que puedes eliminar esa parte

## Cambio al flujo pedido por el dueño

Los gastos ya no llevan foto del recibo. Se registró como D-062, que reemplaza el texto de gastos de `current/flujo.md`. La versión anterior del flujo está en `../archive/flujo-2026-10-20-con-foto-de-recibo.md`. La muestra aprobada no incluye foto del recibo.

## Elegido

| Aspecto | Elección | Valor exacto |
| --- | --- | --- |
| Ingresos del mes | Resumen arriba y lista debajo | arriba "Esperado" y "Recibido" con cifras de `18px` y una barra de avance de 6px en color de marca; debajo, filas con sitio, monto y ficha de estado (Pendiente en contorno ámbar) |
| Marcar como recibido | Interruptor en la fila con fecha | en la fila del ingreso, etiqueta "Recibido" con interruptor de 40px; debajo, campo "Fecha de cobro" |
| Registro de un gasto | Control Global o Jobsite al inicio | control segmentado Global / Jobsite; si es Jobsite, campo selector de jobsite; campos Categoría y Monto; sin foto del recibo |
| Gastos recurrentes | Lista con monto y frecuencia | filas con nombre, frecuencia ("Cada mes") debajo y el monto a la derecha |
| Costo de personal | Control Por empleado o Por jobsite | control segmentado Por empleado / Por jobsite; filas con nombre, horas y monto |
| Dashboard | Cuatro tarjetas de cifras | cuadrícula de 2 columnas con tarjetas Ingresos, Personal, Gastos y Profit (cifra de `20px`); debajo, "Recibido" y "Pendiente" |
| Filtros del dashboard | Control Global o Por cuenta y mes con flechas | control segmentado Global / Por cuenta; debajo, selector de mes con flecha izquierda, mes y flecha derecha |

Notas de lo que las muestras no definieron y queda pendiente:

- La muestra del registro de gasto no mostró el campo Fecha, aunque el flujo dice que un gasto lleva fecha; dónde va ese campo no se ha decidido.
- Cómo se ve el dashboard por cuenta no se mostró.
- Cómo se agrega o edita un gasto recurrente no se mostró.
- Los nombres y las cifras son de ejemplo.

Copia visual de lo aprobado: [`ronda-07-accounting-aprobado.html`](ronda-07-accounting-aprobado.html).

## Opciones mostradas y no elegidas

No se usan.

- **Ingresos del mes:** lista con ficha de estado; agrupada en pendientes y recibidos.
- **Marcar como recibido:** hoja inferior con la fecha y Confirmar; formulario con monto y fecha.
- **Registro de un gasto:** formulario con foto del recibo al final; foto del recibo primero (ambas con foto, que ya no se usa).
- **Gastos recurrentes:** tarjetas con la próxima fecha; lista con interruptor para pausar.
- **Costo de personal:** tarjetas por jobsite con subtotal; lista plana de empleado, jobsite y monto.
- **Dashboard:** cifras con barras de comparación; profit grande arriba y desglose.
- **Filtros:** dos campos desplegables; fichas de periodo y selector de cuenta.
