# Survey visual, ronda 9: pendientes de Ventas y listas

Fecha: 2026-10-20. Respuesta del dueño, textual:

> Ronda 9 del survey visual. Control Gravable del quote: Interruptor Gravable en el renglón. Elegir el sitio al agendar: Campo desplegable de sitio arriba. Motivo al marcar un lead como perdido: Campo desplegable de motivo y nota. Frecuencia más abierta: Campo de texto libre. Pantalla de inicio del admin: Cifras del mes y pendientes. Lista de jobsites: Agrupada por cliente. Lista de empleados: Lista compacta con iniciales y estado.

## Cambio a una decisión anterior

El armado del quote (D-076, ronda 8) mostraba "Gravable" solo como texto. D-077 lo reemplaza: ahora el renglón lleva un interruptor Gravable y el quote termina con Subtotal, Tax y Total mensual. D-076 queda marcada como Reemplazada y la versión anterior de `current/diseno-visual.md` está en `../archive/diseno-visual-2026-10-20-antes-de-D-077.md`.

## Elegido

| Aspecto | Elección | Valor exacto |
| --- | --- | --- |
| Control Gravable del quote | Interruptor Gravable en el renglón | cada servicio y add-on con nombre y monto a la izquierda y, a la derecha, la etiqueta "Gravable" con un interruptor de 40px (encendido en color de marca); al final Subtotal, "Tax 6% sobre lo gravable" y Total mensual |
| Sitio al agendar | Campo desplegable de sitio arriba | campo con contorno de 1px, esquinas de 12px y flecha; debajo la línea "Después, el calendario y la hora" y el botón sólido Continuar |
| Motivo de lead perdido | Campo desplegable de motivo y nota | campo desplegable Motivo, campo Nota (opcional) y botón sólido Marcar como perdido |
| Frecuencia más abierta | Campo de texto libre | campo desplegable Tipo con "Otra" y campo "Describe la frecuencia" de texto libre |
| Inicio del admin | Cifras del mes y pendientes | arriba "Ingresos del mes" y "Profit" con cifras de `18px`; debajo filas de pendientes con contador en una ficha de fondo de marca |
| Lista de jobsites | Agrupada por cliente | título pequeño con el nombre del cliente y debajo sus jobsites, cada uno con tarifa mensual y ficha de estado (Activo en contorno verde, Pausado en contorno ámbar) |
| Lista de empleados | Lista compacta con iniciales y estado | filas separadas por línea fina con círculo de 36px con iniciales, nombre, tipo de trabajador y rol, y ficha de estado (Activo o Inactivo) |

Notas de lo que las muestras no definieron y queda pendiente:

- Los motivos de la lista de Perdido son de ejemplo (Precio y otros); la lista real no está decidida.
- Los pendientes del inicio (Trabajos por aprobar, Seguimientos de leads) son de ejemplo; qué pendientes aparecen depende de los permisos de cada persona y no se ha definido aquí.
- El inicio del empleado ya está definido por su horario (D-048).
- Los nombres y las cifras son de ejemplo.

Copia visual de lo aprobado: [`ronda-09-pendientes-y-listas-aprobado.html`](ronda-09-pendientes-y-listas-aprobado.html).

## Opciones mostradas y no elegidas

No se usan.

- **Gravable:** casilla debajo del renglón; ficha tocable Gravable o Exento.
- **Sitio al agendar:** fichas con los sitios del lead; lista de sitios con dirección.
- **Motivo de perdido:** fichas de motivos y nota opcional; lista de motivos con Otro.
- **Frecuencia más abierta:** cuadrícula de días del mes; patrones predefinidos.
- **Inicio del admin:** lista de pendientes con contadores; agenda de hoy y pendientes.
- **Lista de jobsites:** lista compacta con estado; tarjetas con tarifa y frecuencia.
- **Lista de empleados:** tarjetas con tipo y jobsites; agrupada por rol.
