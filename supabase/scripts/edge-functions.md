# Edge Functions

Funciones: `create-employee`, `resend-invitation` (D-171, D-172, D-186) y `open-document` (D-125). Las tres tienen `verify_jwt` activado: solo las llama quien ya entró. Los permisos los decide la base de datos con el JWT de quien llama (`create_employee` exige `empleados_invitar_crear`); la service role solo se usa dentro de la función, para crear el usuario de Auth y leer perfiles. Este archivo no contiene llaves.

## Secreto

- `RESEND_API_KEY`: llave de Resend llamada `cidclean-edge-functions`, con permiso `sending_access` (solo envío) y limitada al dominio `auth.cidclean.com`. Vive solo como secreto de las funciones de Supabase. Para rotarla: crear otra con `POST https://api.resend.com/api-keys`, guardarla con `POST https://api.supabase.com/v1/projects/$REF/secrets` (`[{"name":"RESEND_API_KEY","value":"..."}]`) y borrar la anterior en Resend.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase.

## Correo de invitación

La fuente es `supabase/email-templates/invitacion.html` (texto de D-186, `{{name}}` es el nombre). La función usa `supabase/functions/_shared/invitacion.ts`, que se genera con `node supabase/scripts/generar-invitacion.mjs`; hay que volver a generarlo y a desplegar si cambia la plantilla. El correo sale de `no-reply@auth.cidclean.com` con el asunto "Te invitamos a Cid Clean / You're invited to Cid Clean". No lleva enlaces.

## Despliegue

Con `SUPABASE_ACCESS_TOKEN` en el entorno, desde la raíz del repositorio:

```
npx supabase@latest functions deploy create-employee --project-ref <ref> --use-api
npx supabase@latest functions deploy resend-invitation --project-ref <ref> --use-api
npx supabase@latest functions deploy open-document --project-ref <ref> --use-api
```

## Respuestas

`create-employee` recibe `full_name`, `phone`, `worker_type` (`w2` o `1099`), `role`, `language`, `has_app_access` y `email`, y devuelve `{ id, invitation }` con `invitation` en `none` (sin acceso), `sent` o `failed` (el empleado quedó creado y se puede reenviar). Errores: `forbidden` 403, `invalid` 400, `email_taken` 409, `server_error` 500. `resend-invitation` recibe `profile_id` y devuelve `{ invitation: 'sent' }`; 409 si no tiene acceso (`no_access`), ya entró (`already_logged_in`) o está inactivo (`inactive`).

## Pruebas del 2026-10-21

Prueba de extremo a extremo con 15 comprobaciones (permisos, validación, enlace con Auth, plantilla de 8 permisos, correo repetido, reenvío, primer ingreso): todas pasaron. Los correos de prueba fueron a `delivered+edge1@resend.dev` (entregados) y no se envió ningún código de Auth a un correo real. Los perfiles y usuarios de prueba se borraron; el historial (solo se agrega) conserva sus filas.

## open-document (D-125)

Es la única forma de abrir un documento sensible de un 1099 (W-9 o certificado de seguro). El bucket `employee-docs` ya no tiene política de lectura (migración `20261021000006`): ningún usuario autenticado lee ni firma URLs directo desde Storage. La función recibe `document_id`, llama a `open_profile_document` con el JWT de quien llama (exige `empleados_gestionar_documentos` desde D-193, ya no `empleados_ver_pagos`, y deja la fila `documento_abierto` en `change_log` con quién y cuándo) y, solo si eso funcionó, firma con la service role una URL de 60 segundos. Devuelve `{ url, expires_in: 60 }`. Errores: `forbidden` 403, `invalid` 400, `not_found` 404, `server_error` 500; sin JWT, 401. Subir sigue con la política de insert (`employee_docs_insert`).

## Pruebas de las órdenes 10 y 11

- `supabase/tests/empleados.sql`, `supabase/tests/permisos.sql` (plantillas y `save_employee_permissions`) y `supabase/tests/terminos.sql`: pruebas SQL repetibles (terminan en rollback). Se corren con la Management API (`/database/query`) o `psql -f`; la última consulta lista cada prueba con `ok`.
- `supabase/tests/open-document.e2e.mjs`: 26 comprobaciones contra el proyecto real. Quien tiene `empleados_gestionar_documentos` no firma, no descarga ni lista archivos desde Storage; `open-document` rechaza sin permiso y con solo `empleados_ver_pagos` (403), con la llave anónima (403) y sin JWT (401); con permiso entrega el PDF y cada apertura deja una fila en `change_log`.
- `supabase/tests/terms-storage.e2e.mjs`: 9 comprobaciones del bucket `terms` (solo el Super Admin sube, cualquier empleado firma y lee, nadie reemplaza ni borra). No publica versiones: `terms_documents` es de solo agregar.
- Las dos pruebas e2e crean perfiles y usuarios temporales `@prueba.local` y los borran al terminar; el historial (solo se agrega) conserva sus filas.

## Hito 4: send-quote y quote-portal (D-209)

- `send-quote` (`verify_jwt` activado): con el JWT de quien envía, `prepare_send_quote` valida `quotes_enviar`, el SOW y los destinatarios; la función genera el PDF de una página (pdf-lib con Manrope, que baja de Google Fonts; si no hay red usa Helvetica), lo guarda en `quote-files/<quote>/<versión>/quote-<versión>.pdf`, confirma el envío (`confirm_send_quote`, solo service role) y manda el correo a cada destinatario. `{ resend: true }` reenvía el correo de una versión ya enviada. Devuelve `{ sent, failed }`.
- `quote-portal` (**sin** `verify_jwt`: lo usa el cliente sin cuenta; desplegar con `--no-verify-jwt`): acciones `state`, `request`, `verify`, `quote`, `file` y `decide`. Solo llama a las funciones `portal_*`, que no puede ejecutar ningún rol de la API. Responde igual a un correo que no es del quote (no revela destinatarios). Al aceptar copia el SOW a `jobsite-docs/<jobsite>/` y avisa por correo a quien envió.
- Correo: `Cid Clean <quotes@mail.cidclean.com>`, respuesta a `admin@cidclean.com`. Dominio `mail.cidclean.com` creado y verificado en Resend; sus 4 registros (DKIM `resend._domainkey.mail`, MX y TXT `send.mail`, CNAME `rsend.mail`) están en Cloudflare con el comentario "Resend mail.cidclean.com". No se tocaron los de Vercel ni Zoho.
- Secretos de las funciones: `RESEND_QUOTES_KEY` (llave `cidclean-quotes`, solo envío, limitada a `mail.cidclean.com`), `PORTAL_CODE_PEPPER` (aleatorio; con él se guarda el hash del código del cliente) y `PORTAL_BASE_URL` (`https://quote.cidclean.com`).

```
npx supabase@latest functions deploy send-quote --project-ref <ref> --use-api
npx supabase@latest functions deploy quote-portal --project-ref <ref> --use-api --no-verify-jwt
```

## Portal en quote.cidclean.com (Cloudflare Pages)

Proyecto de Pages `cidclean-quote` con el dominio `quote.cidclean.com` (registro CNAME proxied a `cidclean-quote.pages.dev`). Se publica la exportación web con solo las rutas del portal:

```
cd app && EXPO_PUBLIC_PORTAL_ONLY=1 npx expo export --platform web --clear --output-dir dist-portal
printf '/* /index.html 200\n' > dist-portal/_redirects
# Pages no publica carpetas node_modules: las fuentes se mueven y se reescriben sus rutas.
mv dist-portal/assets/node_modules dist-portal/assets/nm
grep -rl "assets/node_modules/" dist-portal --include=*.js --include=*.html | xargs sed -i 's#assets/node_modules/#assets/nm/#g'
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler pages deploy dist-portal --project-name cidclean-quote --branch main
```

## Pruebas del hito 4

Última corrida (2026-10-23, orden 17): 37 de 37 contra `quote.cidclean.com` recién publicado; no quedaron datos de prueba (el historial conserva sus 20 filas).

- `supabase/tests/quotes.sql`: 87 pruebas (totales, armado, permisos, envío, portal, bloqueo del código, límites, decisiones, Cliente y Jobsite, Perdido sin sitios abiertos, versiones, vencimiento).
- `supabase/tests/quote-portal.e2e.mjs`: 37 comprobaciones contra el proyecto real (enviar con PDF y correo, portal completo y aceptar; en un segundo sitio pedir cambios, versión 1.1 que reemplaza y se reenvía, y rechazar con motivo). Escribe solo a `admin@cidclean.com`; pone un `PORTAL_CODE_PEPPER` conocido al empezar y uno aleatorio nuevo al terminar; borra lo que crea.

## walkthrough-pdf (hito 3, D-212)

PDF del resumen del walkthrough. `verify_jwt` activado. Recibe `walkthrough_id`, `version` y `language` (`es` o `en`). Con el JWT de quien llama, `walkthrough_pdf_source` (migración `20261023000002`) exige poder ver walkthroughs (`walkthroughs_hacer`, `leads_ver` o `clientes_editar_walkthrough_sow`) y da los datos de esa versión. Si la versión aún no tiene PDF, la service role lo arma (`functions/walkthrough-pdf/pdf.ts`: encabezado "Cid Clean" en `#0F766E`, Sitio y contacto, Áreas en tabla y Frecuencia; las fotos en un anexo; sin notas internas), lo guarda en el bucket privado `walkthrough-pdfs` como `<walkthrough>/v<versión>.pdf` y anota `pdf_path` en `walkthrough_versions`. Devuelve `{ url, expires_in: 60, path }`. Errores: `forbidden` 403, `invalid` 400, `not_found` 404, `server_error` 500; sin JWT, 401. Manrope se baja de jsDelivr (`@expo-google-fonts/manrope@0.4.2`); si no responde, usa Helvetica. La app la llama al cerrar cada versión y al tocar "Ver PDF".

```
npx supabase@latest functions deploy walkthrough-pdf --project-ref <ref> --use-api
```
