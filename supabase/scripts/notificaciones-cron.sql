-- Cron del correo de los avisos (hito 7, orden 28). NO está aplicado: se corre después de desplegar la Edge Function
-- send-notifications (ver supabase/scripts/edge-functions.md, "Hito 7"). No contiene llaves: la service role se lee
-- de Vault, donde hay que guardarla una vez con el nombre 'cidclean_service_role_key':
--   select vault.create_secret('<service role key>', 'cidclean_service_role_key');
-- Cada 5 minutos: correos inmediatos; el resumen diario sale solo desde las 8:00 AM de Naples (lo decide la base).
create extension if not exists pg_net;
select cron.schedule('cidclean-avisos-correo', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://noammaqhtdfgbheeiugo.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
                                  'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cidclean_service_role_key')),
    body := '{}'::jsonb)
$$);
