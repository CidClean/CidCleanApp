# Cid Clean App

App para Cid Clean, compañía de limpieza comercial en Naples, Florida. Este repositorio es el registro y la memoria del proyecto: qué se decidió, qué está vigente y qué quedó atrás.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `current/` | Solo la versión vigente de cada documento. Es la única fuente de verdad. |
| `archive/` | Lo que fue reemplazado, con su fecha. Se conserva, pero no se usa. |
| `decisions.md` | Registro de decisiones con fecha, estado y a cuál reemplazan. |
| `surveys/` | Respuestas de los surveys visual y de seguridad. |

## Reglas

Las reglas del repositorio, obligatorias para toda persona o AI, están en [`AGENTS.md`](AGENTS.md). Léelas antes de leer o cambiar cualquier cosa.

## Estado

Flujo completo definido (`current/flujo.md`). Survey visual: rondas 1 (identidad), 2 (componentes), 3 (iconos, densidad y pantallas del walkthrough), 4 (portal del quote), 5 (pantallas del staff en Operaciones), 6 (gestión del admin), 7 (Accounting), 8 (Ventas), 9 (pendientes de Ventas y listas), 10 (notificaciones, términos del staff, idioma, historial, ajustes, Super Admin y aviso sin conexión), 11 (pantallas pendientes: aprobación de trabajos, semana siguiente, Más opciones del portal, salario mínimo, margen, fecha del gasto y motivos de perdido) y 12 (todos los pendientes restantes: tarifa fija, cuentas, calendario, listas de partida, Ajustes, notificaciones e iconos) aprobadas, ver `current/diseno-visual.md`. Seguridad estándar aprobada, ver `current/seguridad.md`. Lo que el dueño dejó para deducir (categorías de gastos, Urgente, barra inferior y Menú) está registrado como delegado, ver `surveys/deducciones-2026-10-21.md`. Arquitectura aprobada, ver `current/arquitectura.md`. Siguiente: el dueño deja listas las conexiones (Expo, Supabase, Apple, Google, Resend, dominio) y empieza la construcción por la etapa 1 (proyecto, entrada, perfiles y permisos).
