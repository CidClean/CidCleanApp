-- Pruebas de "To approve" por visita (migración 20261030000001, orden 44; D-261, D-262, D-266). Repetibles: todo
-- termina en rollback. Uso: psql -f supabase/tests/aprobar_por_visita.sql (la última consulta lista cada prueba con ok).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table ids (k text primary key, v uuid);
grant all on resultados, actores, ids to public;

-- Devuelve el resultado o 'ERR:<sqlstate>:<mensaje>'.
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
    resultado := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  return resultado;
end $$;

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
create function pg_temp.pid(n text) returns uuid language sql as $$ select profile_id from actores where nombre = $1 $$;

-- Personas: sup registra y edita; aprob aprueba; admin2 tiene todo el Work sin ser Super Admin; super es el Super Admin.
-- Staff: humbe, ida y sub con acceso a la app; estela y maria sin acceso (maria sin pago asignado).
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['sup', 'aprob', 'admin2', 'humbe', 'estela', 'ida', 'maria', 'sub'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-ap.local', quien not in ('estela', 'maria')) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-ap.local');
    insert into actores values (quien, aid, pid);
  end loop;
  aid := gen_random_uuid();
  insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-ap.local');
  update profiles set auth_user_id = aid where is_super_admin and auth_user_id is null;
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('sup', 'work_registrar_por_otros'), ('sup', 'work_editar'), ('sup', 'work_revisar_gps'),
                 ('aprob', 'work_aprobar'),
                 ('admin2', 'work_registrar_por_otros'), ('admin2', 'work_editar'), ('admin2', 'work_aprobar'), ('admin2', 'work_revisar_gps'))
      as p(n, k) on p.n = a.nombre;
end $$;

-- Una visita terminada (ve), otra terminada (ve2) y otra en curso (vr).
do $$
declare
  cli uuid;
  js uuid;
  a uuid;
  n text;
  ve uuid;
  ve2 uuid;
  vr uuid;
begin
  insert into clients (name, legacy) values ('Cuenta Prueba AP', true) returning id into cli;
  insert into jobsites (client_id, name, address, frequency) values (cli, 'Sede AP', '1 Main St', '{"kind":"other","days":[]}') returning id into js;
  foreach n in array array['humbe', 'estela', 'ida'] loop
    insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (js, pg_temp.pid(n), cc_today() - 10) returning id into a;
    insert into assignment_pay (assignment_id, kind, hourly_rate, effective_from) values (a, 'hourly', 20, cc_today() - 10);
  end loop;
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js, now() - interval '5 hours', 240, local_day(now() - interval '5 hours')) returning id into ve;
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js, now() - interval '28 hours', 120, local_day(now() - interval '28 hours')) returning id into ve2;
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js, now() - interval '1 hour', 240, local_day(now() - interval '1 hour')) returning id into vr;
  insert into visit_staff (visit_id, profile_id) select ve, pg_temp.pid(x) from unnest(array['humbe', 'estela', 'ida', 'maria']) x;
  insert into visit_staff (visit_id, profile_id) select ve2, pg_temp.pid(x) from unnest(array['humbe', 'estela']) x;
  insert into visit_staff (visit_id, profile_id) values (vr, pg_temp.pid('estela'));
  -- Humbe marcó entrada y salida desde el teléfono en ve y ve2.
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status)
  values (ve, pg_temp.pid('humbe'), now() - interval '5 hours', now() - interval '1 hour', 'ok', 'ok'),
         (ve2, pg_temp.pid('humbe'), now() - interval '28 hours', now() - interval '26 hours', 'ok', 'ok');
  insert into ids values ('ve', ve), ('ve2', ve2), ('vr', vr);
end $$;

-- Registro automático (D-261 (1), D-266 (1))
select pg_temp.prueba('el automático llena solo a quien no tiene acceso y ya terminó la visita', '3', fill_auto_work()::text);
select pg_temp.prueba('idempotente: la segunda vez no crea nada', '0', fill_auto_work()::text);
select pg_temp.prueba('en la visita en curso no hay automático todavía', '0',
  (select count(*) from work_entries where visit_id = pg_temp.id('vr'))::text);
select pg_temp.prueba('estela queda con la hora programada y estado auto', 'auto|auto|t',
  (select in_status || '|' || out_status || '|' || (w.clock_in = v.starts_at and w.clock_out = v.starts_at + make_interval(mins => v.minutes))::text::char(1)
     from work_entries w join visits v on v.id = w.visit_id where v.id = pg_temp.id('ve') and w.profile_id = pg_temp.pid('estela')));
select pg_temp.prueba('quien tiene acceso no recibe automático (ida)', '0',
  (select count(*) from work_entries where visit_id = pg_temp.id('ve') and profile_id = pg_temp.pid('ida'))::text);
select pg_temp.prueba('el cron corre cada 5 minutos', '*/5 * * * *',
  (select schedule from cron.job where jobname = 'cidclean-registro-automatico'));

-- La tarjeta de "To approve" (D-266 (2))
select pg_temp.prueba('el staff no ve "To approve"', 'ERR:42501', left(pg_temp.valor('humbe', 'select work_to_approve()::text'), 9));
select pg_temp.prueba('la visita en curso con solo un programado sin registro no aparece', 'false',
  pg_temp.valor('aprob', format('select work_to_approve() @> %L', jsonb_build_array(jsonb_build_object('id', pg_temp.id('vr'))))));
select pg_temp.prueba('una fila por persona: programados ∪ registros', '4',
  pg_temp.valor('aprob', format('select jsonb_array_length((select x->''rows'' from jsonb_array_elements(work_to_approve()) x where x->>''id'' = %L))', pg_temp.id('ve'))));
select pg_temp.prueba('estados: humbe ok, estela auto, ida missing, maria auto', 'ok,auto,missing,auto',
  pg_temp.valor('aprob', format($q$select string_agg(r->>'status', ',' order by array_position(array['Prueba humbe','Prueba estela','Prueba ida','Prueba maria'], r->>'name'))
     from jsonb_array_elements(visit_work(%L)->'rows') r$q$, pg_temp.id('ve'))));
select pg_temp.prueba('ida: entrada y salida null (missing) y con acceso a la app', 'true|true|true',
  pg_temp.valor('aprob', format($q$select (r->'clock_in' = 'null'::jsonb)::text || '|' || (r->'clock_out' = 'null'::jsonb)::text || '|' || (r->>'has_app_access')
     from jsonb_array_elements(visit_work(%L)->'rows') r where r->>'name' = 'Prueba ida'$q$, pg_temp.id('ve'))));
select pg_temp.prueba('pago asignado: humbe sí, maria no (aviso)', 'true|false',
  pg_temp.valor('aprob', format($q$select max(r->>'has_pay') filter (where r->>'name' = 'Prueba humbe') || '|' || max(r->>'has_pay') filter (where r->>'name' = 'Prueba maria')
     from jsonb_array_elements(visit_work(%L)->'rows') r$q$, pg_temp.id('ve'))));
select pg_temp.prueba('la tarjeta lleva la cuenta', 'Cuenta Prueba AP', pg_temp.valor('aprob', format('select visit_work(%L)->>''client''', pg_temp.id('ve'))));

-- Aprobar bloquea con alguien sin hora (missing_time)
select pg_temp.prueba('con alguien programado sin registro no se aprueba (missing_time)', 'ERR:22023:missing_time',
  pg_temp.valor('aprob', format('select approve_visit(%L)::text', pg_temp.id('ve'))));

-- No show (D-266 (3))
select pg_temp.prueba('el staff no marca No show', 'ERR:42501', left(pg_temp.valor('humbe', format('select mark_no_show(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('maria'))), 9));
select pg_temp.prueba('No show de maria', '', pg_temp.valor('sup', format('select mark_no_show(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('maria'))));
select pg_temp.prueba('su registro automático se borra y queda marcada', '0|true',
  (select count(*) from work_entries where visit_id = pg_temp.id('ve') and profile_id = pg_temp.pid('maria'))::text || '|' ||
  (select no_show::text from visit_staff where visit_id = pg_temp.id('ve') and profile_id = pg_temp.pid('maria')));
select pg_temp.prueba('el automático no la vuelve a crear', '0', fill_auto_work()::text);
select pg_temp.prueba('la tarjeta ya no la tiene y la lista en No show', '3|Prueba maria',
  pg_temp.valor('aprob', format($q$select jsonb_array_length(visit_work(%1$L)->'rows') || '|' || (visit_work(%1$L)->'no_show'->0->>'name')$q$, pg_temp.id('ve'))));
select pg_temp.valor('sup', format('select undo_no_show(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('maria')));
select pg_temp.prueba('deshacer el No show vuelve a crear su automático', '1',
  (select count(*) from work_entries where visit_id = pg_temp.id('ve') and profile_id = pg_temp.pid('maria'))::text);
select pg_temp.valor('sup', format('select mark_no_show(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('maria')));
select pg_temp.valor('sup', format('select mark_no_show(%L, %L)::text', pg_temp.id('ve2'), pg_temp.pid('humbe')));
select pg_temp.prueba('No show de quien marcó desde el teléfono: se borra y queda en el historial', '0|true',
  (select count(*) from work_entries where visit_id = pg_temp.id('ve2') and profile_id = pg_temp.pid('humbe'))::text || '|' ||
  (select (detail->'registro_borrado'->>'del_telefono') from change_log where action = 'no_show' and entity_id = pg_temp.id('ve2') order by id desc limit 1));
select pg_temp.valor('sup', format('select edit_work_entry(%L, %L, %L)::text', w.id, w.clock_in, w.clock_out + interval '10 minutes'))
  from work_entries w where w.visit_id = pg_temp.id('ve2') and w.profile_id = pg_temp.pid('estela');
select pg_temp.prueba('editar un automático lo pasa a manual', 'manual|manual',
  (select in_status || '|' || out_status from work_entries where visit_id = pg_temp.id('ve2') and profile_id = pg_temp.pid('estela')));

-- Sustituto e ida (D-266 (3))
select pg_temp.prueba('agregar persona: cualquier empleado activo que no está', 'true|false',
  pg_temp.valor('sup', format($q$select (work_addable_staff(%1$L) @> jsonb_build_array(jsonb_build_object('name', 'Prueba sub')))::text || '|' ||
     (work_addable_staff(%1$L) @> jsonb_build_array(jsonb_build_object('name', 'Prueba humbe')))::text$q$, pg_temp.id('ve'))));
select pg_temp.valor('sup', format('select record_work(%L, %L)::text', pg_temp.id('ve'),
  jsonb_build_array(jsonb_build_object('profile_id', pg_temp.pid('sub'), 'clock_in', now() - interval '5 hours', 'clock_out', now() - interval '1 hour'),
                    jsonb_build_object('profile_id', pg_temp.pid('ida'), 'clock_in', now() - interval '5 hours', 'clock_out', now() - interval '2 hours'))));
select pg_temp.prueba('el sustituto queda no programado', 'unscheduled|true',
  pg_temp.valor('aprob', format($q$select (r->>'status') || '|' || (r->>'unscheduled') from jsonb_array_elements(visit_work(%L)->'rows') r where r->>'name' = 'Prueba sub'$q$, pg_temp.id('ve'))));
select pg_temp.prueba('ida registrada a mano', 'manual', pg_temp.valor('aprob', format($q$select r->>'status' from jsonb_array_elements(visit_work(%L)->'rows') r where r->>'name' = 'Prueba ida'$q$, pg_temp.id('ve'))));
select pg_temp.prueba('con todos con hora se aprueba la visita', '', pg_temp.valor('aprob', format('select approve_visit(%L)::text', pg_temp.id('ve'))));
select pg_temp.prueba('pago de humbe: 4 h a 20 = 80', '240|80.00',
  (select pay_minutes || '|' || pay_amount from work_entries where visit_id = pg_temp.id('ve') and profile_id = pg_temp.pid('humbe')));
select pg_temp.prueba('el automático no toca una visita aprobada', '0',
  (select fill_auto_work()::text));

-- D-262: solo el Super Admin corrige una visita aprobada
select pg_temp.prueba('otro admin no edita una visita aprobada', 'ERR:22023', left(pg_temp.valor('admin2', format('select edit_work_entry(%L, %L, %L)::text',
  (select id from work_entries where visit_id = pg_temp.id('ve') and profile_id = pg_temp.pid('humbe')), now() - interval '5 hours', now())), 9));
select pg_temp.prueba('otro admin no agrega en una visita aprobada', 'ERR:22023', left(pg_temp.valor('admin2', format('select record_work(%L, %L)::text', pg_temp.id('ve'),
  jsonb_build_array(jsonb_build_object('profile_id', pg_temp.pid('maria'), 'clock_in', now() - interval '5 hours', 'clock_out', now() - interval '1 hour')))), 9));
select pg_temp.prueba('otro admin no marca No show en una visita aprobada', 'ERR:22023', left(pg_temp.valor('admin2', format('select mark_no_show(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('sub'))), 9));
select pg_temp.prueba('el Super Admin edita: 5 h', '', pg_temp.valor('super', format('select edit_work_entry(%L, %L, %L)::text',
  (select id from work_entries where visit_id = pg_temp.id('ve') and profile_id = pg_temp.pid('humbe')), now() - interval '6 hours', now() - interval '1 hour')));
select pg_temp.prueba('se recalcula el pago (5 h a 20 = 100)', '300|100.00',
  (select pay_minutes || '|' || pay_amount from work_entries where visit_id = pg_temp.id('ve') and profile_id = pg_temp.pid('humbe')));
select pg_temp.prueba('queda trabajo_corregido en el historial', '1',
  (select count(*)::text from change_log where action = 'trabajo_corregido' and entity = 'work_entries'));
select pg_temp.valor('super', format('select record_work(%L, %L)::text', pg_temp.id('ve'),
  jsonb_build_array(jsonb_build_object('profile_id', pg_temp.pid('maria'), 'clock_in', now() - interval '5 hours', 'clock_out', now() - interval '1 hour'))));
select pg_temp.prueba('el Super Admin agrega a alguien (sin pago asignado: minutos reales, sin monto)', '240|null|false',
  (select pay_minutes || '|' || coalesce(pay_amount::text, 'null') || '|' || (select no_show::text from visit_staff where visit_id = pg_temp.id('ve') and profile_id = pg_temp.pid('maria'))
     from work_entries where visit_id = pg_temp.id('ve') and profile_id = pg_temp.pid('maria')));
select pg_temp.valor('super', format('select mark_no_show(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('sub')));
select pg_temp.prueba('el Super Admin marca No show en una aprobada', '0',
  (select count(*) from work_entries where visit_id = pg_temp.id('ve') and profile_id = pg_temp.pid('sub'))::text);
select pg_temp.prueba('la visita sigue aprobada', 'true', (select (approved_at is not null)::text from visits where id = pg_temp.id('ve')));

-- Inicio
select pg_temp.prueba('Inicio: la visita en curso no cuenta como por aprobar; ve2 sí', '1',
  pg_temp.valor('aprob', 'select work_home_pending()->>''to_approve'''));

select n, prueba, ok, detalle from resultados order by n;
rollback;
