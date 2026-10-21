# Edge Functions

Funciones: `create-employee` y `resend-invitation` (D-171, D-172, D-186). Las dos tienen `verify_jwt` activado: solo las llama quien ya entró. Los permisos los decide la base de datos con el JWT de quien llama (`create_employee` exige `empleados_invitar_crear`); la service role solo se usa dentro de la función, para crear el usuario de Auth y leer perfiles. Este archivo no contiene llaves.

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
```

## Respuestas

`create-employee` recibe `full_name`, `phone`, `worker_type` (`w2` o `1099`), `role`, `language`, `has_app_access` y `email`, y devuelve `{ id, invitation }` con `invitation` en `none` (sin acceso), `sent` o `failed` (el empleado quedó creado y se puede reenviar). Errores: `forbidden` 403, `invalid` 400, `email_taken` 409, `server_error` 500. `resend-invitation` recibe `profile_id` y devuelve `{ invitation: 'sent' }`; 409 si no tiene acceso (`no_access`), ya entró (`already_logged_in`) o está inactivo (`inactive`).

## Pruebas del 2026-10-21

Prueba de extremo a extremo con 15 comprobaciones (permisos, validación, enlace con Auth, plantilla de 8 permisos, correo repetido, reenvío, primer ingreso): todas pasaron. Los correos de prueba fueron a `delivered+edge1@resend.dev` (entregados) y no se envió ningún código de Auth a un correo real. Los perfiles y usuarios de prueba se borraron; el historial (solo se agrega) conserva sus filas.
