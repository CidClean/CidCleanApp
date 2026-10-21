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

Es la única forma de abrir un documento sensible de un 1099 (W-9 o certificado de seguro). El bucket `employee-docs` ya no tiene política de lectura (migración `20261021000006`): ningún usuario autenticado lee ni firma URLs directo desde Storage. La función recibe `document_id`, llama a `open_profile_document` con el JWT de quien llama (exige `empleados_ver_pagos` y deja la fila `documento_abierto` en `change_log` con quién y cuándo) y, solo si eso funcionó, firma con la service role una URL de 60 segundos. Devuelve `{ url, expires_in: 60 }`. Errores: `forbidden` 403, `invalid` 400, `not_found` 404, `server_error` 500; sin JWT, 401. Subir sigue con la política de insert (`employee_docs_insert`).

## Pruebas de la orden 10

- `supabase/tests/empleados.sql` y `supabase/tests/terminos.sql`: pruebas SQL repetibles (terminan en rollback). Se corren con la Management API (`/database/query`) o `psql -f`; la última consulta lista cada prueba con `ok`.
- `supabase/tests/open-document.e2e.mjs`: 21 comprobaciones contra el proyecto real. Quien tiene `empleados_ver_pagos` no firma, no descarga ni lista archivos desde Storage; `open-document` rechaza sin permiso (403), con la llave anónima (403) y sin JWT (401); con permiso entrega el PDF y cada apertura deja una fila en `change_log`.
- `supabase/tests/terms-storage.e2e.mjs`: 9 comprobaciones del bucket `terms` (solo el Super Admin sube, cualquier empleado firma y lee, nadie reemplaza ni borra). No publica versiones: `terms_documents` es de solo agregar.
- Las dos pruebas e2e crean perfiles y usuarios temporales `@prueba.local` y los borran al terminar; el historial (solo se agrega) conserva sus filas.
