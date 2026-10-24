-- Pruebas de los avisos (migración 20261027000003, hito 7, orden 28; D-215). Repetibles: rollback. No envían correos.
-- Uso: psql -f supabase/tests/notificaciones.sql (la última consulta lista cada prueba con ok = true/false).
-- Nota: las pruebas de "clock in olvidado" usan la hora actual; cerca de la medianoche de Naples pueden no aplicar.

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
grant all on resultados, actores to public;

create function pg_temp.valor(quien text, consulta text) returns text language plpgsql as $$
declare
  resultado text;
  uid uuid;
begin
  select auth_id into uid from actores where nombre = quien;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate;
  end;
  reset role;
  return resultado;
end $$;

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

-- Se parte sin avisos de otras personas en la cuenta (solo dentro de esta transacción).
delete from notifications;

do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['gps', 'gps_en', 'reg', 'sched', 'staff', 'sinacceso', 'rec', 'nada'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access, language)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', quien <> 'sinacceso', case when quien = 'gps_en' then 'en' else 'es' end::app_language)
    returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('gps', 'work_revisar_gps'), ('gps_en', 'work_revisar_gps'), ('reg', 'work_registrar_por_otros'),
                 ('sched', 'schedule_ver_editar'), ('rec', 'gastos_recurrentes'), ('sinacceso', 'work_revisar_gps')) as p(n, k) on p.n = a.nombre;
end $$;

do $$
declare
  cli uuid;
  js uuid;
  v uuid;
  v2 uuid;
  v3 uuid;
  w uuid;
  rid uuid;
  staff uuid := (select profile_id from actores where nombre = 'staff');
  gps uuid := (select profile_id from actores where nombre = 'gps');
  sinacceso uuid := (select profile_id from actores where nombre = 'sinacceso');
  rec uuid := (select profile_id from actores where nombre = 'rec');
  r jsonb;
begin
  perform pg_temp.prueba('el permiso de quien ya tiene la lista', 'true', (gps in (select profiles_with(array['work_revisar_gps'])))::text);
  perform pg_temp.prueba('sin acceso a la app no recibe avisos (D-215)', 'false', (sinacceso in (select profiles_with(array['work_revisar_gps'])))::text);
  -- Los permisos dados arriba ya avisaron "Cambio de permisos" a cada persona; se borran para empezar limpio.
  perform pg_temp.prueba('dar permisos avisa a la persona', 'true', (select count(*) > 0 from notifications where profile_id = gps and kind = 'permissions_changed')::text);
  delete from notifications;

  -- Canales (D-085, D-215): los tres encendidos por defecto.
  perform pg_temp.prueba('canales por defecto', '{"push": true, "email": true, "in_app": true}', pg_temp.valor('staff', 'select my_notification_settings()::text'));
  perform notify_profiles(array[staff], 'work_approved', '{"jobsite":"Sede"}', null, false, 'x1');
  perform notify_profiles(array[staff], 'work_approved', '{"jobsite":"Sede"}', null, false, 'x1');
  perform pg_temp.prueba('el mismo aviso no se repite', '1', (select count(*) from notifications where profile_id = staff)::text);
  perform pg_temp.prueba('con correo encendido queda pendiente de enviar', 'pending', (select email_status from notifications where profile_id = staff));
  perform pg_temp.valor('staff', 'select set_my_notification_settings(true, false, true)::text');
  perform notify_profiles(array[staff], 'work_approved', '{"jobsite":"Sede"}', null, false, 'x2');
  perform pg_temp.prueba('con correo apagado no se envía', 'none', (select email_status from notifications where profile_id = staff and dedupe = 'x2'));
  perform pg_temp.valor('staff', 'select set_my_notification_settings(true, false, false)::text');
  perform notify_profiles(array[staff], 'work_approved', '{"jobsite":"Sede"}', null, false, 'x3');
  perform pg_temp.prueba('con correo y app apagados no se crea', '0', (select count(*) from notifications where profile_id = staff and dedupe = 'x3')::text);
  perform pg_temp.valor('staff', 'select set_my_notification_settings(true, true, true)::text');
  perform notify_profiles(array[sinacceso], 'work_approved', '{}', null, false, 'x4');
  perform pg_temp.prueba('a quien no tiene acceso no se le crea', '0', (select count(*) from notifications where profile_id = sinacceso)::text);

  -- Bandeja (D-084, D-117): cada uno ve los suyos, en su idioma; leer al tocar; contador.
  perform pg_temp.prueba('la bandeja trae solo los míos con su texto', '2|Trabajo aprobado|Sede',
    pg_temp.valor('staff', 'select jsonb_array_length(n) || ''|'' || (n->0->>''title'') || ''|'' || (n->0->>''detail'') from (select my_notifications() n) z'));
  perform pg_temp.prueba('otro no ve mis avisos', '0', pg_temp.valor('nada', 'select jsonb_array_length(my_notifications())::text'));
  perform pg_temp.prueba('ni leyendo la tabla', '0', pg_temp.valor('nada', 'select count(*)::text from notifications'));
  perform pg_temp.prueba('la tabla no se escribe directo', 'ERR:42501',
    pg_temp.valor('staff', format('insert into notifications (profile_id, kind) values (%L, %L) returning id::text', staff, 'x')));
  perform pg_temp.prueba('contador de no leídos', '2', pg_temp.valor('staff', 'select my_unread_count()::text'));
  perform pg_temp.valor('staff', format('select mark_notifications_read(%L)::text', (select id from notifications where profile_id = staff and dedupe = 'x1')));
  perform pg_temp.prueba('tocar uno lo marca leído', '1', pg_temp.valor('staff', 'select my_unread_count()::text'));
  perform pg_temp.valor('staff', 'select mark_notifications_read()::text');
  perform pg_temp.prueba('o todos', '0', pg_temp.valor('staff', 'select my_unread_count()::text'));

  -- Eventos inmediatos.
  insert into clients (name, legacy) values ('Cliente Avisos', true) returning id into cli;
  insert into jobsites (client_id, name, address, frequency) values (cli, 'Sede Avisos', '1 St', '{"kind":"daily","days":[]}') returning id into js;
  insert into visits (jobsite_id, starts_at, minutes, local_date)
  values (js, now() + interval '1 hour', 120, local_day(now() + interval '1 hour')) returning id into v;
  insert into visit_staff (visit_id, profile_id) values (v, staff);
  perform pg_temp.prueba('programar a alguien le avisa "horario nuevo o cambiado"', '1',
    (select count(*) from notifications where profile_id = staff and kind = 'schedule_changed')::text);
  insert into work_entries (visit_id, profile_id, clock_in, in_status, in_distance_m) values (v, staff, now(), 'out_of_range', 400) returning id into w;
  perform pg_temp.prueba('GPS fuera de rango avisa a quien revisa el GPS', '2|0',
    (select count(*) filter (where kind = 'gps_out')::text from notifications where profile_id in (select profile_id from actores where nombre in ('gps', 'gps_en')))
    || '|' || (select count(*) from notifications where kind = 'gps_out' and profile_id in (select profile_id from actores where nombre not in ('gps', 'gps_en')))::text);
  perform pg_temp.prueba('en el idioma de cada uno', 'Clock in with GPS out of range',
    pg_temp.valor('gps_en', 'select my_notifications()->0->>''title'''));
  update work_entries set clock_out = now() + interval '1 hour', out_status = 'ok' where id = w;
  update visits set approved_at = now() where id = v;
  perform pg_temp.prueba('aprobar avisa a quien trabajó', '1', (select count(*) from notifications where profile_id = staff and kind = 'work_approved' and dedupe = 'approved:' || v)::text);
  update visits set removed = true where id = v;
  perform pg_temp.prueba('quitar la visita avisa "te quitaron de una visita"', '1', (select count(*) from notifications where profile_id = staff and kind = 'schedule_removed')::text);
  insert into recurring_expenses (name, category_id, amount, frequency, day, active_since)
  values ('Seguro', (select id from expense_categories order by sort limit 1), 100, 'monthly', 1, cc_today()) returning id into rid;
  insert into expenses (category_id, spent_on, amount, recurring_id, period) values ((select id from expense_categories order by sort limit 1), cc_today(), 100, rid, month_start(cc_today()));
  perform pg_temp.prueba('gasto recurrente generado avisa a quien gestiona recurrentes', '1', (select count(*) from notifications where profile_id = rec and kind = 'recurring_generated')::text);

  -- Revisión cada 15 minutos.
  insert into visits (jobsite_id, starts_at, minutes, local_date)
  values (js, now() + interval '90 minutes', 60, local_day(now() + interval '90 minutes')) returning id into v2;
  insert into visit_staff (visit_id, profile_id) values (v2, staff);
  insert into visits (jobsite_id, starts_at, minutes, local_date)
  values (js, now() - interval '40 minutes', 60, local_day(now() - interval '40 minutes')) returning id into v3;
  insert into visit_staff (visit_id, profile_id) values (v3, staff);
  -- 13 h el viernes y 13 h el sábado de esta semana, más las dos visitas de 1 h de hoy: 28 h.
  insert into visits (jobsite_id, starts_at, minutes, local_date)
  select js, ((week_monday(cc_today()) + d + time '06:00') at time zone cc_tz()), 780, week_monday(cc_today()) + d from (values (5), (6)) x(d);
  insert into visit_staff (visit_id, profile_id) select id, staff from visits where jobsite_id = js and minutes = 780;
  perform notifications_scan();
  perform notifications_scan();
  perform pg_temp.prueba('visita próxima 2 h antes, una vez', '1', (select count(*) from notifications where profile_id = staff and kind = 'visit_soon' and dedupe = 'soon:' || v2)::text);
  perform pg_temp.prueba('clock in olvidado a los 30 min, a quien registra por otros',
    case when local_day(now() - interval '40 minutes') = cc_today() then '1' else '0' end,
    (select count(*) from notifications where profile_id = (select profile_id from actores where nombre = 'reg') and kind = 'clock_in_forgotten' and dedupe = 'cin:' || v3 || ':' || staff)::text);
  perform pg_temp.prueba('alerta de 32 h desde 28 h, solo a quien arma el schedule (D-223)', '1|0',
    (select count(*) from notifications where profile_id = (select profile_id from actores where nombre = 'sched') and kind = 'hours_32')::text
    || '|' || (select count(*) from notifications where profile_id = staff and kind = 'hours_32')::text);

  -- Correo: solo la service role toma los pendientes; los del resumen no salen con los inmediatos.
  perform pg_temp.prueba('la app no toma correos', 'ERR:42501', pg_temp.valor('staff', 'select claim_notification_emails(false)::text'));
  perform notify_profiles(array[staff], 'followup_due', '{"company":"Lead X"}', null, true, 'dig1');
  r := claim_notification_emails(false);
  perform pg_temp.prueba('los inmediatos se toman con correo, título y texto', 'true',
    (jsonb_array_length(r) > 0 and r->0 ? 'email' and r->0 ? 'title')::text);
  perform pg_temp.prueba('lo del resumen diario no sale con los inmediatos', 'false',
    (exists (select 1 from jsonb_array_elements(r) x where x->>'kind' = 'followup_due'))::text);
  perform mark_notification_emails(array(select (x->>'id')::uuid from jsonb_array_elements(r) x), true);
  perform pg_temp.prueba('y quedan enviados', '0', (select count(*) from notifications where email_status = 'sending')::text);
  update notifications set created_at = now() - interval '3 days' where dedupe = 'dig1';
  perform claim_notification_emails(true);
  perform pg_temp.prueba('un correo viejo ya no se manda, queda solo en la app', 'none', (select email_status from notifications where dedupe = 'dig1'));
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
