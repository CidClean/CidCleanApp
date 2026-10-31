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

- Texto de los términos del staff, del abogado (hito 1).
- SOW y contrato como documentos externos (hito 4).
- Cuentas de Apple Developer y Google Play (antes del hito 8).
- Confirmar con el contador o abogado la retención de 3 años (D-127).
- Cambiar los tokens entregados en el chat cuando terminen las pruebas.

## Por construir

Legal rev. 3 (D-275 a D-285), en este orden:

1. Fase A: HECHA y publicada el 2026-10-30 (días de servicio, conversión de 90 registros con $6,980 intactos, W-2 con ubicación obligatoria).
2. Fase B: HECHA y publicada el 2026-10-30 (términos en inglés con bloqueo y aviso, privacidad versionada, eliminar cuenta en Mi perfil, fotos solo admin, W-9 cifrado con 4 de 4 vigentes cifrados). Falta publicar en la app los términos v1.0 y la privacidad v1.0 (legal/rev3/web/pdf/), cuando el dueño diga: avisa por correo a todo el personal y bloquea hasta aceptar.
3. Fase C: HECHA y publicada el 2026-10-31 (quote ≠ contrato, contrato del cliente con firma y contrafirma, 30 días de vigencia, 15 de precio, residencial sin 6%; los 3 jobsites existentes quedan firmados). Pendiente menor: la cuadrícula del Schedule sigue visible en un jobsite sin contrato (el servidor rechaza programar); retención del contrato desde la fecha de fin de la relación (fase E).
4. Fase D: ICA antes del primer trabajo, ofertas de trabajo y advertencias (D-285).
5. Fase E: retención y borrado automático (D-281); W-2 sin acceso con corrección en 7 días, salario mínimo y horas extra (D-278).

6. D-291: marca "Proveedor de cuentas" en el cliente (Wilson Franquicia), sus jobsites sin quote ni contrato.

7. D-293: PDFs de documento real (todos).
8. D-294: Resumen del empleado.
9. D-295: Profit & Loss con vista Schedule C.

Pendiente: prueba real de Ida en iPhone con Safari.

Preguntas abiertas para el dueño:

- (ninguna por ahora)
