# Bucket público `brand` (orden 32, D-248, D-250)

El logo de los correos se sirve desde Storage: bucket **público** `brand`, solo PNG, máximo 1 MB, con un único archivo
`logo-192.png` (copia de `brand/cid-clean-simbolo-correo-192.png`). Los correos lo usan por su URL pública:

```
https://noammaqhtdfgbheeiugo.supabase.co/storage/v1/object/public/brand/logo-192.png
```

Está en `supabase/functions/_shared/correo.ts` (`LOGO_URL`) y en `supabase/email-templates/invitacion.html` y
`magic-link.html`. Este archivo no contiene llaves.

## Cómo se crea

Con `SUPABASE_ACCESS_TOKEN` y `SUPABASE_PROJECT_REF` en el entorno, desde la raíz del repositorio. La service role se
saca de la Management API solo en memoria (variable de la shell, nunca en un archivo):

```
SR=$(curl -sS "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | python3 -c "import sys,json; print(next(k['api_key'] for k in json.load(sys.stdin) if k['name']=='service_role'))")
U="https://$SUPABASE_PROJECT_REF.supabase.co"

# 1. Bucket público, solo PNG, 1 MB.
curl -sS -X POST "$U/storage/v1/bucket" -H "Authorization: Bearer $SR" -H "apikey: $SR" -H "Content-Type: application/json" \
  -d '{"id":"brand","name":"brand","public":true,"allowed_mime_types":["image/png"],"file_size_limit":1048576}'

# 2. Logo (x-upsert para poder reemplazarlo).
curl -sS -X POST "$U/storage/v1/object/brand/logo-192.png" -H "Authorization: Bearer $SR" -H "apikey: $SR" \
  -H "Content-Type: image/png" -H "x-upsert: true" -H "Cache-Control: max-age=31536000" \
  --data-binary @brand/cid-clean-simbolo-correo-192.png

# 3. Comprobar: 200 image/png.
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" "$U/storage/v1/object/public/brand/logo-192.png"
unset SR
```

Un bucket público solo permite leer por la URL pública; subir, reemplazar o borrar sigue necesitando la service role
(no hay políticas para `authenticated` ni `anon` en `storage.objects` para este bucket).

## Estado

Orden 32: el ejecutor no pudo crearlo (el permiso de la sesión no dejó usar la service role). Lo crea el arquitecto
con los pasos de arriba antes de desplegar las funciones de correo.
