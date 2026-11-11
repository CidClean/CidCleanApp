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
6. Cada publicación sale a la vez en el teléfono (actualización de Android) y en la web (app.cidclean.com y quote.cidclean.com) (D-273).

## Pendientes del dueño

- Cuentas de Apple Developer y Google Play (antes del hito 8).
- Confirmar con el contador la línea del Schedule C de cada categoría de gasto (D-295).
- Cambiar los tokens entregados en el chat (Cloudflare, llaves de R2, Expo).
- Prueba real de Ida en iPhone con Safari (app.cidclean.com).

## Hecho (2026-10-30 y 31)

Legal rev. 3 fases A a D, términos v3 y privacidad v1 publicados en la app, proveedor de cuentas (D-291), PDFs de documento, Resumen del empleado y Profit & Loss (D-293 a D-295), nombres legibles de archivos (D-296).

## Por construir

1-2. D-301 y D-302: HECHO y publicado el 2026-11-11 (21 sitios de leads y 1 jobsite quedan con "Completa la dirección").
3. Hito 8 (empezó el 2026-11-11). Revisión de seguridad hecha; respuestas del dueño en D-303 a D-306. Correcciones publicadas el 2026-11-11 (pagos ocultos sin permiso, precios del quote, rol admin solo del Super Admin, dos pasos del Super Admin, cabeceras web, cierre de sesión al desactivar, portales). Pendiente: que la sesión venza también en el servidor (sessions_timebox de Supabase), que exige el plan Pro (D-146: plan gratis); mientras tanto la duración la controla la app.
4. Año que viene (D-300): Google Play, App Store (dudosa, $99 al año) y notificaciones en el teléfono.
5. Hito final (D-300): fase E legal (D-278, D-281).

Preguntas abiertas para el dueño:

- (ninguna por ahora)
