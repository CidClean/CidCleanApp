-- Cron del correo de los avisos (hito 7, orden 28). NO está aplicado: se corre después de desplegar la Edge Function
-- send-notifications (ver supabase/scripts/edge-functions.md, "Hito 7"). No contiene llaves: el secreto se lee
-- de Vault ('cidclean_cron_secret') y es el mismo que el secreto CIDCLEAN_CRON_SECRET de la Edge Function (desplegada
-- con --no-verify-jwt):
--   select vault.create_secret('<secreto>', 'cidclean_cron_secret');
-- Cada 5 minutos: correos inmediatos; el resumen diario sale solo desde las 8:00 AM de Naples (lo decide la base).
create extension if not exists pg_net;
select cron.schedule('cidclean-avisos-correo', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://noammaqhtdfgbheeiugo.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cidclean-cron',
                                  (select decrypted_secret from vault.decrypted_secrets where name = 'cidclean_cron_secret')),
    body := '{}'::jsonb)
$$);
