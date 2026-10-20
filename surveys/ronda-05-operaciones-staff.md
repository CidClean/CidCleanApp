# Survey visual, ronda 5: pantallas del staff en Operaciones

Fecha: 2026-10-20. Respuesta del dueño, textual:

> Ronda 5 del survey visual. Horario del empleado: Tira de días y lista del día elegido. Marcar entrada: Desliza para marcar entrada. Pantalla durante el turno: Cronómetro grande y botón Marcar salida. Aviso si el GPS falla al marcar: Muestra la distancia y deja reintentar. Registro del trabajo por supervisor o admin: Filas con entrada y salida editables. Lista de trabajos por aprobar: Lista con estado; al tocar se abre el detalle. Cómo ve el admin el GPS fuera de rango: Ficha ámbar en la fila.

## Elegido

| Aspecto | Elección | Valor exacto |
| --- | --- | --- |
| Horario del empleado | Tira de días y lista del día elegido | tira de 7 botones (L a D) con el número del día, esquinas de 8px; los días con visita van con fondo de marca; debajo, la lista de visitas del día con nombre del sitio, horario y flecha |
| Marcar entrada | Desliza para marcar entrada | pista de 48px de alto con borde de 1px y esquinas de 12px; perilla de marca de 42px con flecha; texto "Desliza para marcar entrada"; arriba, sitio, horario y "Ubicación lista" con icono de ubicación |
| Pantalla durante el turno | Cronómetro grande y botón Marcar salida | "Entrada" con la hora; cronómetro de `34px`; botón sólido Marcar salida |
| Aviso si el GPS falla | Muestra la distancia y deja reintentar | título "Estás a X m del sitio", dirección del sitio debajo; botón con contorno Reintentar ubicación (con icono) y botón sólido Marcar de todos modos |
| Registro por supervisor o admin | Filas con entrada y salida editables | una fila por empleado con nombre y dos campos de hora (entrada y salida, contorno de 1px, esquinas de 10px); botón sólido Guardar |
| Trabajos por aprobar | Lista con estado; al tocar se abre el detalle | filas separadas por línea fina con sitio, fecha, número de empleados y horas, y ficha de estado Pendiente (contorno ámbar) |
| GPS fuera de rango para el admin | Ficha ámbar en la fila | ficha con contorno ámbar `#B7791F` y el texto "GPS fuera de rango" en la fila del trabajo |

Notas de lo que las muestras no definieron y queda pendiente:

- La tira de días muestra una semana; cómo se pasa a la semana siguiente no se mostró.
- Deslizar aplica a marcar entrada; para la salida se eligió un botón, no un deslizador.
- La pantalla del detalle de un trabajo por aprobar no se mostró.
- Los nombres, horarios, horas y la distancia de 420 m son de ejemplo.

Copia visual de lo aprobado: [`ronda-05-operaciones-staff-aprobado.html`](ronda-05-operaciones-staff-aprobado.html).

## Opciones mostradas y no elegidas

No se usan.

- **Horario:** dos pestañas y lista agrupada por día; una sola lista con separador de semana.
- **Marcar entrada:** botón redondo grande; botón ancho dentro de la visita.
- **Durante el turno:** tarjeta compacta con tiempo transcurrido; franja fija arriba En turno.
- **GPS falla:** alerta antes de marcar con dos botones; marca directo y confirma después.
- **Registro por supervisor o admin:** lista de programados con casillas y Agregar empleado; fichas de empleados y buscador.
- **Por aprobar:** tarjetas con botones Revisar y Aprobar; selección múltiple y barra Aprobar.
- **GPS fuera de rango:** mini mapa con el sitio y el punto de entrada; tarjeta de alerta con distancia y hora.
