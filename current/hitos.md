# Hitos de construcción

Plan para terminar la app, aprobado por el dueño el 2026-10-21 (D-170). Cada hito cierra con algo que se puede probar en el teléfono. El orden y el alcance salen de `flujo.md`; si algo cambia, se edita aquí, se registra en `../decisions.md` y la versión anterior pasa a `../archive/`.

| # | Hito | Al terminar se puede | Estado |
| --- | --- | --- | --- |
| 0 | Etapa 1: base | Entrar con código por correo, sesiones, permisos y su historial en la base de datos, Inicio, Menú, Mi perfil y términos del primer ingreso | Hecho (`900db08`) |
| 1 | Cierre de la etapa 1 | Crear y administrar usuarios, perfiles y permisos desde la app; activar los términos cuando haya texto del abogado | En curso |
| 2 | Ventas A: Leads | Registrar leads (web, campañas y manual), seguir sus estados y recibir recordatorios | Pendiente |
| 3 | Ventas B: Walkthrough | Llenar el walkthrough en el sitio, con fotos y sin internet; sincroniza después y genera el PDF | Pendiente |
| 4 | Ventas C: Quote y portal | Armar el quote desde el walkthrough, enviarlo por correo, y que el cliente lo vea en el portal web, lea el SOW y acepte o rechace; al aceptar nace el Cliente con su Jobsite | Pendiente |
| 5 | Operaciones A: Clientes, Jobsites y Empleados | Ver y gestionar cuentas, sitios, personal y su pago por jobsite | Pendiente |
| 6 | Operaciones B: Schedule y Work | Programar trabajos, que el staff registre sus visitas y que el Inicio del staff muestre la visita de hoy | Pendiente |
| 6b | Cobro por planes (D-227) | Descartado por el dueño (D-237): los extras son otro quote y el invoice va fuera de la app por ahora | Descartado |
| 7 | Accounting y avisos | Registrar ingresos y gastos, ver márgenes, calcular lo que se debe a cada empleado; notificaciones y alerta de 32 h | Pendiente |
| 8 | Cierre y lanzamiento | Revisión de seguridad completa, pruebas con usuarios reales, cuentas de Apple y Google, tiendas y portal en su subdominio | Pendiente |

## Cómo se trabaja cada hito

1. Se lee el repositorio y se detecta lo que falta decidir.
2. Se pregunta al dueño solo lo que falta, con una ronda del survey visual.
3. Lo aprobado se registra con valores exactos y su copia en HTML, y se le muestra el commit (reglas 8 y 9 de `../AGENTS.md`).
4. El ejecutor construye por órdenes numeradas y el arquitecto revisa cada commit antes de subirlo.
5. El dueño prueba en el teléfono y aprueba.

## Pendientes del dueño

- Texto de los términos del staff, del abogado (hito 1).
- SOW y contrato como documentos externos (hito 4).
- Cuentas de Apple Developer y Google Play (antes del hito 8).
- Confirmar con el contador o abogado la retención de 3 años (D-127).
- Cambiar los tokens entregados en el chat cuando terminen las pruebas.

## Por construir (al reiniciarse el uso semanal del dueño)

Registrado, sin construir. En este orden:

1. D-265: app completa en la web en app.cidclean.com, probada con WebKit; prueba real de Ida en iPhone con Safari. Hace falta un token nuevo de Cloudflare.
2. D-265: correo de invitación con "Open Cid Clean" (web) y "Download for Android".
3. D-261: registro automático de quien no tiene acceso a la app; "To approve" por persona, con "missing" en la hora que falta.
4. D-262: el Super Admin registra y edita el trabajo aunque la visita esté aprobada; el pago se recalcula.
5. D-263: el 1099 ve sus documentos, descarga su W-9 y sube su certificado (antes, diseño para aprobar).
6. D-264: formulario nuevo del empleado (nombre, apellidos, teléfono, email, dirección, dirección 2, state, city, ZIP).

Preguntas abiertas para el dueño:

- D-261: ¿el registro automático aparece al terminar la hora programada? ¿Botón "No vino"? ¿Se mantiene aprobar toda la visita?
- D-264: ¿el W-9 toma esa dirección? ¿Cómo se separan los nombres que ya existen? ¿Qué campos son obligatorios?
- W-9: ¿"or EIN" en el correo? ¿Remitente quotes@mail.cidclean.com? ¿"Más opciones" en la ventana del admin? ¿Firma en Times Italic?
- Semana: ¿el miércoles se muestra "X" o "M"?
