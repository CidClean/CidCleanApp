# Arquitectura

Versión vigente de la arquitectura. Cada punto viene de una decisión del dueño, registrada en `../decisions.md` y en `../surveys/arquitectura-01.md`. Si algo cambia, se edita aquí, se registra y la versión anterior pasa a `../archive/`.

Principio: una sola base de código, servicios administrados y nada de servidores que mantener. Los permisos por perfil, el historial y las sesiones aprobados se hacen cumplir en la base de datos, no solo en la pantalla (D-139).

## Piezas (D-139)

| Pieza | Elección |
| --- | --- |
| App | Expo (React Native con TypeScript y Expo Router), en el SDK vigente al empezar. Un solo código para iOS, Android y web. |
| Pruebas y entrega | EAS Build, EAS Update, TestFlight en iPhone y APK de prueba en Android (D-138). |
| Base de datos y permisos | Supabase (Postgres) con reglas por fila: cada permiso del perfil lo valida el servidor. |
| Entrada del staff | Supabase Auth con correo y código de un solo uso, con las sesiones de `seguridad.md`. |
| Portal del quote | Página web del mismo código. El código del cliente se valida en una función del servidor, con los límites de `seguridad.md`. |
| Archivos | Supabase Storage privado (fotos, SOW, contratos, W-9) con enlaces temporales. |
| Lógica del servidor | Supabase Edge Functions y tareas programadas: gastos recurrentes, vencimiento de quotes, recordatorios, alerta de 32 h y PDF del walkthrough y del quote. |
| Notificaciones | Push con Expo Notifications y correo con Resend. |
| GPS | expo-location en el teléfono; la distancia al sitio se calcula en el servidor con la dirección del jobsite. |
| Sin conexión | El walkthrough (se guarda en el teléfono y sincroniza con una cola de fotos) y marcar entrada y salida (se guardan con la hora del teléfono, se sincronizan después y quedan marcadas para revisión, D-214). Lo demás pide conexión. |
| Historial | Lo escribe la base de datos con disparadores; nadie lo edita. |
| Portal en la web | Exportación web alojada en Cloudflare Pages con dominio propio. |
| Repositorio y CI | El mismo repositorio, con carpetas `app/` y `supabase/`; GitHub Actions con EAS. |

## Planes y costos (D-140)

- **En desarrollo:** planes gratuitos (Expo Free, Supabase Free, Resend y Cloudflare Pages gratis).
- **Para producción:** los planes de pago se evalúan antes de salir. Referencia verificada el 2026-10-21: Expo Free incluye hasta 15 builds de iOS y 15 de Android al mes con cola lenta (Starter, $19 al mes más uso); Supabase Pro desde $25 al mes, con copias diarias por 7 días y sin pausa por inactividad. Apple Developer (unos $99 al año) y Google Play (unos $25 una vez) se confirman al abrir las cuentas.

## Cuentas y conexiones (D-141, D-142, D-143)

| Servicio | Estado al 2026-10-21 |
| --- | --- |
| Supabase | Proyecto "CidClean App", ref `noammaqhtdfgbheeiugo`, us-east-1, plan gratis (D-141). Token de acceso entregado por el dueño, no guardado (D-148). El proyecto anterior "CidClean's Project" (ref `scovsbtomhywstpfmoah`) está pausado y no se usa. |
| Expo | Cuenta `cidcleanadmin`. Acceso por token, que no se guarda en el repositorio (D-143). Proyecto `@cidcleanadmin/cidclean` (ID `89b103c3-f85e-41e9-8c01-c3e9823b4fa5`), canal y rama `preview` con la entrada del staff publicada, y un build de Android de prueba lanzado el 2026-10-21 (D-159e). Las variables públicas de Supabase están en el entorno de EAS. |
| Cloudflare | Dominio `cidclean.com` en la cuenta (D-142). Token de cuenta entregado, no guardado (D-162). Los registros actuales (sitio en Vercel, correo en Zoho) no se tocan; el portal va en un subdominio (D-161). |
| GitHub | Repositorio `CidClean/CidCleanApp`; el push funciona. |
| Resend | Cuenta con la llave entregada por el dueño (D-162), que no se guarda. El dominio de envío `auth.cidclean.com` ya está verificado; Supabase Auth lo usará como correo propio (D-160). La cuenta tiene también otro dominio que no es de este proyecto y no se toca. |
| Apple Developer y Google Play | Pendientes; se abren antes de la primera build de iOS y antes de publicar en Android. |

Super Admin: `admin@cidclean.com` (D-144), con su usuario de Auth creado y enlazado al perfil (procedimiento en `supabase/scripts/bootstrap-super-admin.md`). Las tres migraciones de `supabase/migrations/` (perfiles, permisos e historial; Super Admin; endurecer funciones) están aplicadas en el proyecto "CidClean App" desde el 2026-10-21. La configuración de Auth quedó así: solo entra quien recibió invitación (registro abierto desactivado), código de 6 dígitos que vale 10 minutos (D-040, D-123, D-129). El correo de Supabase por defecto envía muy pocos mensajes por hora; para que lleguen los códigos del staff falta conectar Resend (pendiente).

Permisos: catálogo en `permisos.md` (D-145). Forma de trabajo (D-147): Claude ordena, Claude Code ejecuta, el dueño aprueba.

Regla: ninguna llave, token ni contraseña se escribe en este repositorio.
