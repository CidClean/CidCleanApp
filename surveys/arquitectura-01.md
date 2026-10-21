# Arquitectura, ronda 1

Fecha: 2026-10-21. Respuesta del dueño, textual:

> Ok dame tu propuesta lo único que pido es usar expo eas para probar la app lo demas a tu criterios

Registrado: D-138 (Expo con EAS para probar la app). Lo demás es la propuesta de abajo, que el dueño aprobó después (ver el final de este archivo).

## Propuesta de Claude (aprobada, D-139)

Una sola base de código, servicios administrados y nada de servidores que mantener. Los permisos por perfil, el historial y las sesiones ya aprobados se hacen cumplir en la base de datos, no solo en la pantalla.

| Pieza | Elección | Por qué |
| --- | --- | --- |
| App | Expo (React Native con TypeScript y Expo Router), en el SDK vigente al empezar | iOS y Android, y web, desde un solo código |
| Pruebas y entrega | EAS Build, EAS Update, TestFlight en iPhone y APK de prueba en Android | requisito del dueño |
| Base de datos y permisos | Supabase (Postgres) con reglas por fila: cada permiso del perfil lo valida el servidor | los permisos uno por uno se exigen en la base, no se pueden saltar desde la app |
| Entrada del staff | Supabase Auth con correo y código (D-123); sesiones de 30 y 7 días (D-124) | ya aprobado |
| Portal del quote | Página web del mismo código; código de 10 minutos y 5 intentos (D-129) validados por una función del servidor | el cliente no instala nada |
| Archivos | Supabase Storage privado (fotos, SOW, contratos, W-9) con enlaces temporales | los documentos sensibles no quedan públicos |
| Lógica del servidor | Supabase Edge Functions y tareas programadas: gastos recurrentes, vencimiento de quotes, recordatorios, alerta de 32 h y PDF del walkthrough y del quote | corre sola |
| Notificaciones | Push con Expo Notifications y correo con Resend | códigos, quotes y avisos |
| GPS | expo-location en el teléfono; la distancia al sitio se calcula en el servidor con la dirección del jobsite | el empleado no puede manipular el resultado |
| Sin conexión | Solo el walkthrough, como dice el flujo: se guarda en el teléfono y sincroniza con una cola de fotos; lo demás pide conexión | evita complejidad innecesaria |
| Historial | Lo escribe la base de datos con disparadores y nadie lo edita (D-125) | confiable como auditoría |
| Portal en la web | Exportación web alojada en Cloudflare Pages con dominio propio | gratis y sin restricción comercial |
| Repositorio y CI | El mismo repo CidClean/CidCleanApp, con carpetas `app/` y `supabase/`; GitHub Actions con EAS | un solo lugar |

Costos aproximados (los precios de Expo y Supabase se verificaron el 2026-10-21; los de Apple, Google y Resend son según lo conocido y se confirman al abrir las cuentas):

| Concepto | Costo |
| --- | --- |
| Expo EAS plan Free | $0: hasta 15 builds de iOS y 15 de Android al mes, con cola lenta. Plan Starter a $19 al mes más uso si la cola estorba |
| Supabase Pro | desde $25 al mes: copias diarias por 7 días y el proyecto nunca se pausa. El plan Free se pausa tras una semana sin uso y no hace copias |
| Apple Developer | unos $99 al año (necesario para TestFlight) |
| Google Play | unos $25 una sola vez |
| Resend | gratis al inicio, con límite de correos al mes |
| Dominio | unos $12 al año |

Total de partida: unos $25 al mes, más $99 al año y $25 una vez.

Lo que necesitaría que abras, porque yo no puedo crear cuentas con pago: cuenta de Expo, Apple Developer, Google Play Console, Supabase, Resend y el dominio.

Primeras etapas de construcción si se aprueba: (1) base: proyecto, entrada, perfiles y permisos; (2) Ventas con walkthrough y quote; (3) portal del quote; (4) Operaciones y Work; (5) Accounting y avisos.

## Respuesta del dueño a la propuesta (2026-10-21, 08:58)

> Nos mantenemos free en desarrollo evaluemos los planes de pagos en produccion. Apruebo tu propuesta te voy a dejar las conexiones listas

Registrado: D-139 (aprobación de la propuesta, reemplaza a D-138) y D-140 (planes gratuitos en desarrollo, evaluar los de pago antes de producción). El contenido vigente está en `../current/arquitectura.md` y la versión anterior en `../archive/arquitectura-2026-10-21-solo-D-138.md`.

Pendiente: el dueño deja listas las conexiones (cuentas de Expo, Apple Developer, Google Play, Supabase, Resend y el dominio). La construcción empieza por la etapa 1.

Recomendación de Claude, sin aprobar: mientras el proyecto de Supabase esté en el plan gratuito, no cargar datos reales sensibles (W-9, tarifas reales), porque ese plan no hace copias y se pausa tras una semana sin uso.
