# Survey visual, ronda 4: portal del quote

Fecha: 2026-10-20. Respuesta del dueño, textual:

> Ronda 4 del survey visual. Código de verificación: 6 casillas con teclado numérico propio. Documento del SOW adjunto: Botón de texto Leer SOW (PDF). Botón Continuar bloqueado hasta abrir el SOW: Botón bloqueado con aviso. Precio y vigencia: Cuota mensual grande arriba y desglose abajo. Decisión del cliente: Aceptar fijo y menú Más opciones. Aceptación con nombre y cargo: Resumen de lo que acepta y campos. Motivo de rechazo o mensaje de negociación: Motivos rápidos y nota opcional. Pantalla final: Tarjeta de resumen con versión y fecha.

Aclaración del dueño antes de elegir: el SOW es un documento que se crea fuera de la app y solo se adjunta al quote. No se dibuja dentro de la app. El cliente lo abre y lo lee; al abrirlo se activa el botón Continuar; después puede aceptar o rechazar el quote, con una casilla de confirmación de lectura. Una primera versión de este survey que mostraba el SOW por áreas fue un error y no se guardó.

## Elegido

| Aspecto | Elección | Valor exacto |
| --- | --- | --- |
| Código de verificación | 6 casillas con teclado numérico propio | 6 casillas de 48px de alto, esquinas de 12px, la activa con borde de 2px en color de marca; teclado de 3 columnas con teclas de 36px de alto sobre fondo de superficie, con teclas Reenviar y Borrar |
| Documento del SOW | Botón de texto Leer SOW (PDF) | botón con contorno de 1px en color de marca, icono de documento de línea fina y el texto "Leer SOW (PDF)", debajo de la cuota mensual y una descripción corta |
| Continuar bloqueado | Botón bloqueado con aviso | botón en color de superficie con borde de 1px y candado, texto "Continuar"; encima, el aviso "Abre el SOW para poder continuar". Se activa cuando el cliente abre el SOW |
| Precio y vigencia | Cuota mensual grande arriba y desglose abajo | cuota mensual en `26px`; debajo "Válida hasta" con la fecha; después Subtotal, Tax y Total mensual en filas separadas por línea fina |
| Decisión del cliente | Aceptar fijo y menú Más opciones | barra inferior fija con color de superficie y línea superior; botón de tres puntos con contorno (44px de ancho) y botón sólido Aceptar cotización; arriba, el Total mensual con tax |
| Aceptación con nombre y cargo | Resumen de lo que acepta y campos | tarjeta con sitio y total mensual; campos Nombre completo y Cargo con contorno; casilla de confirmación de lectura del SOW y de términos; botón Aceptar cotización |
| Motivo de rechazo o negociación | Motivos rápidos y nota opcional | opciones rápidas en fichas de 6px de esquina (la elegida con fondo de marca); campo Nota (opcional); botón Enviar |
| Pantalla final | Tarjeta de resumen con versión y fecha | círculo de 56px con marca de éxito `#3F8F5F`; "Cotización aceptada"; tarjeta con Sitio, Versión, Aceptada (fecha y hora) y Por (nombre) |

Notas de lo que la muestra no definió y queda pendiente:

- El menú Más opciones de la decisión debe contener Negociar y Rechazar; su pantalla no se mostró.
- El botón con el que se abre el SOW es el de "Leer SOW (PDF)"; la tarjeta de documento con botón Abrir de la muestra del bloqueo era solo ilustrativa y no se usa.
- Si el rechazo también lleva casilla de confirmación de lectura: el dueño no lo ha dicho.
- Los textos de las muestras son de ejemplo. El portal real va en inglés por defecto y también en español.
- Los motivos de rechazo de las fichas (Precio, Alcance, Frecuencia, Otro) son de ejemplo y no están decididos.

Copia visual de lo aprobado: [`ronda-04-portal-quote-aprobado.html`](ronda-04-portal-quote-aprobado.html).

## Opciones mostradas y no elegidas

No se usan.

- **Código de verificación:** 6 casillas separadas; un solo campo con dígitos espaciados.
- **Documento del SOW:** tarjeta de documento con botón Abrir; lista de documentos con Quote y SOW.
- **Continuar bloqueado:** pasos numerados 1 Abrir SOW y 2 Decidir; etiqueta de estado Pendiente de abrir.
- **Precio y vigencia:** solo tabla de desglose; total fijo en barra inferior.
- **Decisión del cliente:** tres botones apilados; tarjetas de opción y Continuar.
- **Aceptación con nombre y cargo:** campos y casilla de aceptación; dos pasos, confirmar y firmar.
- **Motivo de rechazo o negociación:** solo un cuadro de texto; lista de motivos con Otro.
- **Pantalla final:** mensaje simple con marca de éxito; mensaje con próximos pasos.
