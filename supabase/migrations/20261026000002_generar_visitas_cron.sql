-- Las visitas se renuevan solas (D-214): cada día a las 5:15 AM de Naples (9:15 UTC en horario de verano; la hora
-- exacta no importa: también se generan al abrir el schedule, el horario del staff o el Horario del jobsite).
create extension if not exists pg_cron;
select cron.schedule('cidclean-generar-visitas', '15 9 * * *', $$select public.generate_visits()$$);
