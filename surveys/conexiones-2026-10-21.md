# Conexiones, 2026-10-21

Respuesta del dueño (2026-10-21 09:13), textual:

- Supabase: "Creas un Proyecto Nuevo. Estoy consciente de eso"
- Cloudflare: "ya está el dominio cidclean.com, ese es el que vamos a usar"
- Expo: entregó un token de acceso (no se guarda aquí).

Resultado: D-141, D-142 y D-143 en `../decisions.md`; detalle en `../current/arquitectura.md`.

Comprobado por Claude: `eas whoami` responde `cidcleanadmin`; el proyecto de Supabase quedó ACTIVE_HEALTHY, costo $0.

Etapa 1, 2026-10-21: migraciones aplicadas con la API de gestión (D-148). Avisos de seguridad restantes: 7 funciones que ejecuta quien ya entró (grant_permission, revoke_permission, set_my_language, accept_terms y tres de apoyo), a propósito.
