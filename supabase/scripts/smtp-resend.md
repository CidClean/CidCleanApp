# Correo de Supabase Auth por Resend

Decisión: D-160. El código de entrada del staff sale por Resend desde el dominio `auth.cidclean.com` (verificado en la cuenta de Resend del dueño), con remitente `no-reply@auth.cidclean.com` y nombre "Cid Clean". Este archivo no contiene llaves.

## Qué se configuró (2026-10-21)

**En Resend:** una llave de API llamada `Supabase SMTP`, con permiso `sending_access` (solo envío) y limitada al dominio `auth.cidclean.com`. Su valor solo se mostró al crearla y no se guardó en ningún archivo. Es la única llave de esa cuenta que usa Supabase.

**En Supabase** (proyecto "CidClean App", ref `noammaqhtdfgbheeiugo`), con `PATCH https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth`:

| Campo | Valor |
| --- | --- |
| `smtp_host` | `smtp.resend.com` |
| `smtp_port` | `465` |
| `smtp_user` | `resend` |
| `smtp_pass` | la llave `Supabase SMTP` de Resend (Supabase no la devuelve al leer la configuración) |
| `smtp_admin_email` | `no-reply@auth.cidclean.com` |
| `smtp_sender_name` | `Cid Clean` |
| `rate_limit_email_sent` | `30` (correos por hora; con el correo por defecto de Supabase era 2) |
| `mailer_subjects_magic_link` | `Tu código de Cid Clean / Your Cid Clean code` |
| `mailer_templates_magic_link_content` | el contenido de `supabase/email-templates/magic-link.html` |

Sin cambios: `disable_signup` sigue en `true` (registro cerrado), `mailer_otp_length` en `6` y `mailer_otp_exp` en `600` (10 minutos).

## La plantilla

El correo del código usa la plantilla "Magic Link" de Supabase. Su fuente vive en `supabase/email-templates/magic-link.html` (español e inglés, `{{ .Token }}` en grande, 10 minutos de vigencia, sin enlaces ni imágenes). Si se cambia el archivo, se vuelve a aplicar con el `PATCH` de arriba, solo con los dos campos `mailer_*_magic_link`.

## Cómo rotar la llave de envío

1. En Resend, crear una llave nueva: `POST https://api.resend.com/api-keys` con `{"name":"Supabase SMTP","permission":"sending_access","domain_id":"<id de auth.cidclean.com>"}`. Guardar el `token` solo en una variable de shell, sin imprimirlo.
2. En Supabase, `PATCH .../config/auth` con `{"smtp_pass":"<llave nueva>"}`.
3. Probar el envío sin pasar por Supabase: `POST https://api.resend.com/emails` con la llave nueva, desde `Cid Clean <no-reply@auth.cidclean.com>` hacia `delivered@resend.dev`.
4. Borrar la llave anterior en Resend (`DELETE https://api.resend.com/api-keys/<id>`).

La cuenta de Resend tiene otro dominio ajeno (`auth.breaktaxgroup.com`) y otras llaves de otros proyectos; no se tocan. No se modificó ningún registro DNS.

## Pruebas del 2026-10-21

- Creación de la llave: respuesta 201.
- `PATCH` de la configuración: respuesta 200; la lectura posterior confirmó el servidor SMTP, usuario, remitente, nombre, límite, asunto y que la plantilla es igual al archivo.
- Envío de prueba por Resend con la llave nueva a `delivered@resend.dev`: respuesta 200, id `01a15efd-8603-7d87-828e-8b2909cffb2c`.
- No se envió ningún código de Auth a un correo real: esa prueba la hace el dueño.
