# Edge Functions

Funciones: `create-employee`, `resend-invitation` (D-171, D-172, D-186) y `open-document` (D-125). Las tres tienen `verify_jwt` activado: solo las llama quien ya entró. Los permisos los decide la base de datos con el JWT de quien llama (`create_employee` exige `empleados_invitar_crear`); la service role solo se usa dentro de la función, para crear el usuario de Auth y leer perfiles. Este archivo no contiene llaves.

## Secreto

- `RESEND_API_KEY`: llave de Resend llamada `cidclean-edge-functions`, con permiso `sending_access` (solo envío) y limitada al dominio `auth.cidclean.com`. Vive solo como secreto de las funciones de Supabase. Para rotarla: crear otra con `POST https://api.resend.com/api-keys`, guardarla con `POST https://api.supabase.com/v1/projects/$REF/secrets` (`[{"name":"RESEND_API_KEY","value":"..."}]`) y borrar la anterior en Resend.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase.

## Correo de invitación

La fuente es `supabase/email-templates/invitacion.html` (texto en inglés de D-186, solo inglés desde D-247, con el estilo de D-250; `{{name}}` es el nombre). La función usa `supabase/functions/_shared/invitacion.ts`, que se genera con `node supabase/scripts/generar-invitacion.mjs`; hay que volver a generarlo y a desplegar si cambia la plantilla. El correo sale de `no-reply@auth.cidclean.com` con el asunto "You're invited to Cid Clean". No lleva enlaces salvo los del pie (sitio web, teléfono, correo y redes).

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

## open-jobsite-document (hito 5, D-210)

Abre un documento del jobsite (SOW, contrato u otro). `verify_jwt` activado. Recibe `document_id`; `open_jobsite_document` (migración `20261025000001`), con el JWT de quien llama, exige `clientes_ver` (y `clientes_ver_tarifa` para el contrato) y deja `documento_abierto` en `change_log`; después la service role firma una URL de 60 s del bucket `jobsite-docs`. El contrato no tiene lectura directa en Storage: este es su único camino. Errores: `forbidden` 403, `invalid` 400, `not_found` 404, `server_error` 500; sin JWT, 401.

```
npx supabase@latest functions deploy open-jobsite-document --project-ref <ref> --use-api
```

## Hito 4: send-quote y quote-portal (D-209)

- `send-quote` (`verify_jwt` activado): con el JWT de quien envía, `prepare_send_quote` valida `quotes_enviar`, el SOW y los destinatarios; la función genera el PDF de una página (pdf-lib con Manrope, que baja de Google Fonts; si no hay red usa Helvetica), lo guarda en `quote-files/<quote>/<versión>/quote-<versión>.pdf`, confirma el envío (`confirm_send_quote`, solo service role) y manda el correo a cada destinatario. `{ resend: true }` reenvía el correo de una versión ya enviada. Devuelve `{ sent, failed }`.
- `quote-portal` (**sin** `verify_jwt`: lo usa el cliente sin cuenta; desplegar con `--no-verify-jwt`): acciones `state`, `request`, `verify`, `quote`, `file` y `decide`. Solo llama a las funciones `portal_*`, que no puede ejecutar ningún rol de la API. Responde igual a un correo que no es del quote (no revela destinatarios). Al aceptar copia el SOW a `jobsite-docs/<jobsite>/` y avisa por correo a quien envió.
- Correo: `Cid Clean <quotes@mail.cidclean.com>`, respuesta a `info@cidclean.com` (D-249; antes `admin@cidclean.com`). Dominio `mail.cidclean.com` creado y verificado en Resend; sus 4 registros (DKIM `resend._domainkey.mail`, MX y TXT `send.mail`, CNAME `rsend.mail`) están en Cloudflare con el comentario "Resend mail.cidclean.com". No se tocaron los de Vercel ni Zoho.
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

## Hito 7 (órdenes 26 y 28): por desplegar

- `send-quote` y `quote-portal` (cambios de la orden 26, D-238): el PDF de un quote de extra dice "Total" (no "Total mensual") y muestra la fecha del servicio en vez de la frecuencia; el snapshot guarda `extra` y `service_date`; el aviso a quien envió un extra dice "Cuentas y el jobsite". Sin desplegar, todo sigue funcionando: el portal ya toma `extra` y `service_date` de la base (`portal_quote`), y al aceptar un extra la base no crea jobsite (la función no copia el SOW porque `jobsite_id` llega en null).
- `send-notifications` (nueva, orden 28): manda por correo los avisos, desde `no-reply@auth.cidclean.com` con `RESEND_API_KEY` (la misma llave de las funciones, limitada a `auth.cidclean.com`). Solo la llama el cron: compara el encabezado `x-cidclean-cron` con el secreto `CIDCLEAN_CRON_SECRET` de la función (se despliega con `--no-verify-jwt`). Cada llamada manda los inmediatos y, desde las 8:00 AM de Naples, el resumen diario de lo acumulado (un correo por persona). Los textos salen de la base (`notification_text`). Un aviso de más de 1 día (o 2 días en el resumen) ya no se manda por correo: queda solo en la app.
- Cron del correo: `supabase/scripts/notificaciones-cron.sql` (aplicado el 2026-10-24): habilita `pg_net`, lee el secreto de Vault (`cidclean_cron_secret`, el mismo que `CIDCLEAN_CRON_SECRET`) y llama a `send-notifications` cada 5 minutos.
- Crons ya aplicados por las migraciones: `cidclean-accounting` (`20 10 * * *`, `generate_accounting()`) y `cidclean-avisos` (`*/15 * * * *`, `notifications_scan()`, solo crea avisos en la base; no manda correos).

```
npx supabase@latest functions deploy send-quote --project-ref <ref> --use-api
npx supabase@latest functions deploy quote-portal --project-ref <ref> --use-api --no-verify-jwt
npx supabase@latest functions deploy send-notifications --project-ref <ref> --use-api --no-verify-jwt
```

## Orden 32: correos con la marca (D-247, D-249, D-250)

- `_shared/correo.ts`: armazón común (logo de 44 px del bucket público `brand`, "Cid Clean", tarjeta blanca de 24 px, pie con Cid Clean LLC, cidclean.com, teléfono, correo y redes) y su texto plano. Todos los correos salen en inglés.
- `send-quote`: asunto "Your Cid Clean quote for {company}", saludo con el primer nombre del contacto (sin nombre si no hay), sitio y dirección, días (y hora si existe), servicios y add-ons (con su descripción si la línea la trae), total con tax en la tarjeta `#0F766E` ("Total" y fecha del servicio en un extra, D-238), botón "View quote", aviso del código y vigencia y firma "Cid Clean LLC". El PDF va adjunto (`Cid Clean quote {versión}.pdf`); al reenviar se baja de `quote-files`.
- `quote-portal`: código con asunto "Your Cid Clean code: {code}"; aviso de decisión a quien envió, en inglés.
- `send-notifications`: avisos y resumen con el mismo armazón; los textos salen en inglés porque `claim_notification_emails` pide `notification_text` en `en` (migración `20261027000012`). La bandeja de la app sigue en el idioma del perfil.
- Necesita la migración `20261027000012_correos_en_ingles.sql` (contacto y datos del correo en `prepare_send_quote` y `quote_mail_data`). Sin ella el correo sale sin nombre y, al reenviar, sin servicios ni total.
- Pendiente del arquitecto: crear el bucket (`bucket-brand.md`), aplicar la migración y desplegar `send-quote`, `quote-portal` (`--no-verify-jwt`), `send-notifications`, `create-employee` y `resend-invitation`.

## W-9 prellenado: send-w9 y w9-portal (órdenes 41 a 43, D-255, D-256, D-257, D-258)

- Migración `20261027000016_w9.sql` (sin aplicar): tablas `w9_requests`, `w9_portal_codes`, `w9_portal_sessions` y `w9_signatures` sin políticas (solo funciones). Pruebas en `supabase/tests/w9.sql`.
- `send-w9` (`verify_jwt` activado): con el JWT de quien envía, `create_w9_request` / `resend_w9_request` exigen `empleados_gestionar_documentos`. Genera el token (solo se guarda su hash), vence a los 7 días, y manda "Please complete your W-9" con el botón "Complete W-9" a `PORTAL_BASE_URL/w9/{token}` desde `quotes@mail.cidclean.com` (llave `RESEND_QUOTES_KEY`, respuesta a `info@cidclean.com`). Cuerpo `{ profile_id, data, email }` o `{ request_id, resend: true }`; devuelve `{ id, sent, expires_at }`.
- `w9-portal` (**sin** `verify_jwt`, desplegar con `--no-verify-jwt`): acciones `state`, `request`, `verify`, `data`, `preview` (PDF sin número ni firma, con "PREVIEW - NOT SIGNED") y `sign`. El código usa `PORTAL_CODE_PEPPER`. Al firmar llena `_shared/irs/fw9-2024-03.pdf` (copiado en base64 en `_shared/irs/fw9.ts`, que se regenera con `node supabase/scripts/generar-w9.mjs`), lo sube a `employee-docs/<perfil>/w9/signed-<solicitud>-<aleatorio>.pdf` y llama a `w9_portal_sign`, que lo registra como el W-9 vigente, guarda la firma y avisa en la app a quien envió (aviso `w9_signed`).
- El SSN/ITIN/EIN solo pasa por `w9-portal` en la acción `sign`: no se guarda en la base, no se registra en logs ni en `change_log` y ninguna respuesta lo devuelve. Si la firma no queda, el PDF de ese intento se borra.

```
npx supabase@latest functions deploy send-w9 --project-ref <ref> --use-api
npx supabase@latest functions deploy w9-portal --project-ref <ref> --use-api --no-verify-jwt
```

## Legal rev. 3, fase B (órdenes 56 a 59, D-282, D-284, D-280)

Migraciones (sin aplicar, en este orden): `20261030000008_terminos_privacidad_rev3.sql`, `20261030000009_eliminar_cuenta.sql`, `20261030000010_fotos_solo_admin.sql` y `20261030000011_w9_cifrado.sql`. Pruebas: `supabase/tests/legal_rev3.sql` (psql, termina en rollback), `supabase/tests/w9.sql` (rutas `.pdf.enc`) y `node --test supabase/tests/cifrado.test.mjs`.

- **Términos y privacidad:** `accept_pending_terms` (reemplaza `accept_staff_terms`) guarda IP (cabecera `cf-connecting-ip` que pone el servidor, después `x-forwarded-for`) y navegador. `publish_terms(kind, file_path, major)` publica también `privacy`; el aviso (`terms_new` / `privacy_new`) lo manda por correo la `send-notifications` que ya existe (en inglés, plantilla D-250): no hay función nueva que desplegar para esto.
- **Eliminar cuenta:** el aviso `account_deletion_requested` al Super Admin también sale por `send-notifications`.
- **Fotos:** `walkthrough-pdf` arma el PDF sin fotos para quien no tiene rol admin (`<walkthrough>/v<versión>-sin-fotos.pdf`). Redesplegar.
- **W-9 cifrado (AES-256-GCM, `_shared/cifrado.ts`):**
  - Secreto nuevo `W9_FILE_KEY`: 32 bytes aleatorios en base64. Se crea fuera del repositorio y no se guarda en ningún archivo; si se pierde, los W-9 cifrados no se pueden abrir (guárdala también en el gestor de contraseñas del dueño):
    ```
    npx supabase@latest secrets set --project-ref <ref> W9_FILE_KEY="$(openssl rand -base64 32)"
    ```
  - `w9-portal`: cifra el PDF firmado antes de subirlo (`…/w9/signed-<solicitud>-<aleatorio>.pdf.enc`). Redesplegar con `--no-verify-jwt`.
  - `upload-w9` (nueva, `verify_jwt` activado): subida manual de un W-9 por quien tiene `empleados_gestionar_documentos`; cifra y registra con `register_profile_document` (que ya solo acepta W-9 `.enc`). La app ya no sube W-9 directo a Storage.
  - `open-document` (redesplegar): acepta `action: 'open' | 'download'` (las dos quedan en `change_log`: `documento_abierto` / `documento_descargado`). Para un archivo cifrado devuelve un enlace de un solo uso de 60 s a `w9-file` (solo se guarda su hash en `w9_open_tokens`).
  - `w9-file` (nueva, **sin** `verify_jwt`): `GET /functions/v1/w9-file/<enlace>/w9.pdf` consume el enlace, descifra y entrega el PDF con `Cache-Control: no-store`.
  - Los W-9 ya guardados los cifra el arquitecto, una vez, después de la migración 011 y del secreto: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… W9_FILE_KEY=… node supabase/scripts/cifrar-w9-existentes.mjs --dry-run` y después sin `--dry-run`.

```
npx supabase@latest functions deploy walkthrough-pdf --project-ref <ref> --use-api
npx supabase@latest functions deploy open-document --project-ref <ref> --use-api
npx supabase@latest functions deploy upload-w9 --project-ref <ref> --use-api
npx supabase@latest functions deploy w9-file --project-ref <ref> --use-api --no-verify-jwt
npx supabase@latest functions deploy w9-portal --project-ref <ref> --use-api --no-verify-jwt
```

## Fase C: quote no es contrato y contrato del cliente (órdenes 61 a 63, D-283)

Migraciones (sin aplicar, en este orden): `20261030000012_quote_no_es_contrato.sql` y `20261030000013_contratos.sql`. La 012 deja todos los jobsites que ya existen como "Firmado por ambas partes" (migración de datos) y programa la tarea diaria `cidclean-contratos-vencidos` (15 días sin firma → "Requiere actualización"). Pruebas: `supabase/tests/quote_no_es_contrato.sql`, `supabase/tests/contratos.sql` (psql, terminan en rollback) y `node --test supabase/tests/contrato.test.mjs`.

- `quote-portal` (redesplegar, `--no-verify-jwt`): al aceptar manda al cliente la copia de la aceptación con el PDF del quote (desde `quotes@`); la aceptación guarda navegador, IP, versión 1.0 de los Client Portal Terms y el texto de la casilla de rev. 3.
- `contract-admin` (nueva, `verify_jwt` activado, solo Super Admin): `get`, `save`, `preview`, `send` (link `PORTAL_BASE_URL/contract/<token>`, 15 días, desde `documents@mail.cidclean.com`), `countersign` (PDF con certificado en `jobsite-docs/<jobsite>/contract/…`, copia a ambas partes).
- `contract-portal` (nueva, **sin** `verify_jwt`): `state`, `request`, `verify`, `data`, `file`, `sign`. Usa `PORTAL_CODE_PEPPER` y `RESEND_QUOTES_KEY` como los otros portales.

```
npx supabase@latest functions deploy quote-portal --project-ref <ref> --use-api --no-verify-jwt
npx supabase@latest functions deploy contract-admin --project-ref <ref> --use-api
npx supabase@latest functions deploy contract-portal --project-ref <ref> --use-api --no-verify-jwt
```
