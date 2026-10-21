# Seguridad

Versión vigente de las reglas de seguridad de la app. Cada punto viene de una decisión del dueño, registrada en `../decisions.md` y en `../surveys/seguridad-01.md`. Si algo cambia, se edita aquí, se registra y la versión anterior pasa a `../archive/`.

Lo técnico (cifrado, hosting, copias de seguridad y protección contra ataques) no está decidido aquí: se define en la arquitectura con prácticas estándar.

## Acceso y sesiones

- **Entrada del staff (D-123):** correo y código de un solo uso, sin contraseñas. Es el mismo mecanismo del portal del quote.
- **Duración de la sesión (D-124):** 30 días en el teléfono del staff y 7 días para admins y Super Admin. Después piden el código otra vez.
- **Teléfono perdido o baja de un empleado (D-126):** al desactivar a alguien se cierra su sesión al instante y sus datos se conservan. Un admin puede cerrar la sesión de cualquier dispositivo.
- **Quién controla la duración (D-146):** en el plan gratis de Supabase la duración la controla la app, no Supabase.
- **Quién cuenta como admin (D-136):** para la sesión de 7 días, los perfiles con rol de partida Admin y el Super Admin.
- **Cerrar la sesión de otro dispositivo (D-137):** lo hace quien tenga el permiso de editar y desactivar empleados.
- **Super Admin sin acceso (D-128):** se recupera con una verificación de identidad a través de quien administre la app. Nadie más dentro de la app puede reclamar el rol.

## Datos sensibles

- **Tarifas, pagos y documentos (D-125):** las tarifas y los pagos, y los W-9 y certificados de seguro de los 1099, solo los ve quien tenga el permiso de ver pagos. Cada apertura queda registrada en el historial de cambios (quién y cuándo).
- **Conservación (D-127):** las fotos y los datos de GPS se guardan mientras el cliente esté activo y 3 años después. Queda por confirmar con el contador o el abogado del dueño.

## Portal del quote

- **Código (D-129):** el código del cliente vale 10 minutos y se bloquea tras 5 intentos fallidos.
- **Enlace (D-129):** deja de funcionar cuando vence el quote.
