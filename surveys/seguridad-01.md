# Survey de seguridad, ronda 1

Fecha: 2026-10-20. No es visual: se presentó como lista de propuestas estándar y el dueño respondió "Si". Por eso no lleva copia visual en HTML.

Propuesta presentada al dueño, textual:

> 1. **Cómo entra el staff:** correo y código de un solo uso, sin contraseñas que olvidar. Es el mismo mecanismo del portal del quote.
> 2. **Cuánto dura la sesión:** 30 días en el teléfono del staff y 7 días para admins y Super Admin. Después piden el código otra vez.
> 3. **Quién ve las tarifas y los documentos W-9 y de seguro de los 1099:** solo quien tenga el permiso de ver pagos. Cada vez que alguien los abre queda registrado en el historial.
> 4. **Teléfono perdido o empleado que se va:** al desactivar a alguien se cierra su sesión al instante y sus datos se conservan. Un admin puede cerrar sesión en cualquier dispositivo.
> 5. **Cuánto se guardan las fotos y los datos de GPS:** mientras el cliente esté activo y 3 años después. Eso es lo que la ley federal pide como mínimo para registros de nómina. Confírmalo con tu contador o abogado.
> 6. **Si el Super Admin pierde el acceso:** se recupera con una verificación de identidad a través de quien administre la app, sin nadie más dentro de ella.
> 7. **Portal del quote:** el código del cliente vale 10 minutos y se bloquea tras 5 intentos fallidos. El enlace deja de funcionar cuando vence el quote.

Respuesta del dueño (19:17), textual: "Si".

## Registrado

D-123 a D-129, y el contenido en `../current/seguridad.md`.

## Cambio a una decisión anterior

El punto 3 dice que cada apertura de tarifas y documentos queda en el historial, y D-115 decía que el historial registraba solo los cambios importantes. D-125 reemplaza a D-115: el historial registra ambas cosas. `current/flujo.md` y `current/diseno-visual.md` se actualizaron y sus versiones anteriores están en `../archive/flujo-2026-10-20-antes-de-D-125.md` y `../archive/diseno-visual-2026-10-20-antes-de-D-125.md`.

## Notas de lo que no se definió y queda pendiente

- Qué perfiles cuentan como "admins" para la sesión de 7 días, ya que el rol es solo una plantilla de permisos.
- Qué permiso permite a un admin cerrar la sesión de un dispositivo.
- La conservación de 3 años (D-127) está por confirmar con el contador o el abogado del dueño.
- Cómo se verifica la identidad del Super Admin en la recuperación y quién la hace.
- Lo técnico (cifrado, hosting, copias de seguridad, protección contra ataques) se define en la arquitectura.
