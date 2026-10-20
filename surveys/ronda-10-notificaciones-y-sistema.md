# Survey visual, ronda 10: notificaciones y sistema

Fecha: 2026-10-20. Respuesta del dueño, textual:

> Ronda 10 del survey visual. Bandeja de notificaciones: Lista con punto de no leído y hora. Canales de notificación por persona: Tres interruptores globales. Términos del staff en el primer ingreso: Tres puntos resumidos, casilla y Aceptar. Idioma de la app: Control English o Español. Historial de cambios: Lista cronológica simple. Ajustes del sistema: Lista de ajustes que se abren. Transferir el rol de Super Admin: Casilla de confirmación y botón. Aviso sin conexión: Icono de nube con contador en el encabezado.

## Elegido

| Aspecto | Elección | Valor exacto |
| --- | --- | --- |
| Bandeja de notificaciones | Lista con punto de no leído y hora | filas con título, detalle y hora a la derecha; punto de `8px` en `#0F766E` en las no leídas; las leídas sin punto y con el título en peso normal |
| Canales por persona | Tres interruptores globales | pantalla Mis notificaciones con Push (En tu teléfono), Email (A tu correo) y En la app (Dentro de la bandeja); interruptor de 40px por canal; valen para todas las áreas |
| Términos del staff | Tres puntos resumidos, casilla y Aceptar | pantalla Antes de empezar con tres filas con icono (Ubicación solo al marcar entrada y salida, Fotos del trabajo, Tus datos personales), enlace subrayado "Leer los términos completos", casilla "He leído y acepto los términos" y botón sólido Aceptar |
| Idioma | Control English o Español | control segmentado de dos opciones en Mi perfil, con el campo Idioma; la opción activa con fondo `#0F766E` |
| Historial de cambios | Lista cronológica simple | filas con "Persona hizo algo" y debajo día y hora en gris, de la más reciente a la más antigua |
| Ajustes del sistema | Lista de ajustes que se abren | filas con nombre, valor actual en gris y flecha: Vigencia de los quotes (30 días), Categorías de gastos (6 categorías) |
| Transferir Super Admin | Casilla de confirmación y botón | selector Nuevo Super Admin, casilla "Entiendo que dejaré de ser Super Admin" y botón sólido Transferir rol |
| Aviso sin conexión | Icono de nube con contador en el encabezado | bajo el título del encabezado, nube de línea fina y "N pendientes" |

Notas de lo que las muestras no definieron y queda pendiente:

- Cuándo se marca una notificación como leída (al abrirla o al ver la bandeja) y qué hace tocar una fila.
- Si el aviso sin conexión cambia cuando no hay nada pendiente de sincronizar, y cómo se ve cuando termina de sincronizar.
- Cómo se abre y se edita cada ajuste del sistema (pantalla de Vigencia y de Categorías de gastos) y cómo se agregan categorías.
- Qué acciones aparecen en el historial y si se puede filtrar (la muestra elegida no tiene filtros).
- Si la transferencia del Super Admin pide una confirmación adicional (por ejemplo, un código).
- Los nombres, textos y cifras son de ejemplo.

Copia visual de lo aprobado: [`ronda-10-notificaciones-y-sistema-aprobado.html`](ronda-10-notificaciones-y-sistema-aprobado.html).

## Opciones mostradas y no elegidas

No se usan.

- **Bandeja:** agrupada en Hoy y Anteriores; tarjetas con botón de acción.
- **Canales:** tabla de casillas por área y canal; fichas de canal debajo de cada área.
- **Términos del staff:** texto breve con una casilla; tres casillas separadas.
- **Idioma:** campo desplegable; lista de dos opciones.
- **Historial:** fichas de filtro y lista; con valor anterior y nuevo.
- **Ajustes:** una pantalla con campos y categorías; pestañas Quotes y Gastos.
- **Transferir Super Admin:** alerta, selector de persona y botón de transferir; dos pasos (elegir y confirmar).
- **Aviso sin conexión:** franja fija arriba; ficha Pendiente de sincronizar en cada elemento.
