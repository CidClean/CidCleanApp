# Crear el usuario de Auth del Super Admin

Por qué hace falta: el registro de Auth está cerrado y la app pide el código con `shouldCreateUser: false` (D-148, D-150). Un perfil de `profiles` sin usuario de Auth no puede recibir código. El perfil del Super Admin (`admin@cidclean.com`, D-144) lo siembra la migración `20261021000002_super_admin.sql` con `auth_user_id` vacío; este procedimiento crea su usuario de Auth y el disparador `link_auth_user` lo enlaza.

Este archivo no contiene llaves. Los valores se leen del entorno y no se guardan.

## Variables de entorno (no se escriben en el repositorio)

- `SUPABASE_ACCESS_TOKEN`: token de acceso personal de Supabase del dueño.
- `SUPABASE_PROJECT_REF`: `noammaqhtdfgbheeiugo` (proyecto "CidClean App").

## Pasos

1. Ver el estado actual:
   `POST https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query` con
   `{"query":"select email, auth_user_id is not null as enlazado, is_super_admin from profiles"}`
   (cabecera `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`). Antes del procedimiento, `enlazado` es `false`.
2. Obtener la llave de servicio en tiempo de ejecución, solo en memoria:
   `GET https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/api-keys?reveal=true` con la misma cabecera, y tomar la llave llamada `service_role`. No se imprime ni se guarda.
3. Crear el usuario ya confirmado:
   `POST https://$SUPABASE_PROJECT_REF.supabase.co/auth/v1/admin/users` con las cabeceras `apikey` y `Authorization: Bearer` iguales a la llave de servicio, y el cuerpo
   `{"email":"admin@cidclean.com","email_confirm":true}`.
4. Verificar con la consulta del paso 1: `enlazado` debe ser `true` y `is_super_admin` `true`.

Resultado del 2026-10-21: usuario creado y perfil enlazado (`enlazado = true`).

## Plantilla del correo con el código (pendiente)

El correo que recibe quien pide el código usa la plantilla "Magic Link" de Supabase, que por defecto lleva un enlace y no el código. La plantilla de Cid Clean (español e inglés, `{{ .Token }}` en grande, 10 minutos de vigencia, sin enlaces ni imágenes) está en `supabase/email-templates/magic-link.html`, con el asunto "Tu código de Cid Clean / Your Cid Clean code".

El 2026-10-21 la API de gestión rechazó aplicarla (`PATCH /v1/projects/$SUPABASE_PROJECT_REF/config/auth`, campos `mailer_subjects_magic_link` y `mailer_templates_magic_link_content`) con: "Email template modification is not available for free tier projects using the default email provider. Please upgrade your plan or configure a custom SMTP provider." Se aplica cuando el proyecto tenga un SMTP propio (Resend, pendiente en `current/arquitectura.md`) o un plan de pago.
