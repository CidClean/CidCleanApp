-- Pruebas de los días de servicio de los 1099 y la ubicación obligatoria de los W-2
-- (migraciones 20261030000006 y 20261030000007; D-275, D-276, D-277, D-279, D-286, D-262, D-266).
-- Repetibles: todo termina en rollback. Uso (desde la raíz del repositorio): psql -f supabase/tests/dias_servicio.sql
-- (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table ids (k text primary key, v uuid);
grant all on resultados, actores, ids to public;

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

-- Personas: sup registra; aprob aprueba; admin con todo el Work, pagos y costo (sin ser Super Admin); super.
-- 1099: humbe (con acceso, $80 por día), estela (sin acceso, fijo mensual $1,350), karina (sin acceso, $80), lalo (con acceso, por hora antes).
-- W-2: ana (con acceso).
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['sup', 'aprob', 'admin', 'humbe', 'estela', 'karina', 'lalo', 'ana'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, case when quien in ('humbe', 'estela', 'karina', 'lalo') then '1099' else 'w2' end::worker_type,
            'employee', quien || '@prueba-ds.local', quien not in ('estela', 'karina')) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-ds.local');
    insert into actores values (quien, aid, pid);
  end loop;
  aid := gen_random_uuid();
  insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-ds.local');
  update profiles set auth_user_id = aid where is_super_admin and auth_user_id is null;
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
  update profiles p set auth_user_id = a.auth_id from actores a where a.profile_id = p.id and p.auth_user_id is null;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('sup', 'work_registrar_por_otros'), ('aprob', 'work_aprobar'),
                 ('admin', 'work_registrar_por_otros'), ('admin', 'work_editar'), ('admin', 'work_aprobar'),
                 ('admin', 'empleados_ver_pagos'), ('admin', 'personal_ver_costo'), ('admin', 'empleados_asignar_pago'))
      as p(n, k) on p.n = a.nombre;
end $$;

-- D-285 (20261031000002): los 1099 de prueba tienen el ICA firmado por ambas partes y el W-9 firmado.
insert into contractor_agreements (profile_id, source, status, signed_path, signed_sha256, uploaded_by, uploaded_at)
select p.id, 'paper', 'signed', p.id || '/ica/prueba.pdf', repeat('0', 64), p.id, now()
  from actores a join profiles p on p.id = a.profile_id where p.worker_type = '1099';
insert into profile_documents (profile_id, kind, file_path)
select p.id, 'w9', p.id || '/w9/prueba-ica.pdf' from actores a join profiles p on p.id = a.profile_id
 where p.worker_type = '1099' and not exists (select 1 from profile_documents d where d.profile_id = p.id and d.kind = 'w9' and d.replaced_at is null);

-- Jobsite con ubicación; visita terminada hoy (ve), otra de ayer (vy), una futura (vf) y una vieja de un mes atrás (vo).
do $$
declare
  cli uuid;
  js uuid;
  a uuid;
  v uuid;
begin
  insert into clients (name, legacy) values ('Cuenta Prueba DS', true) returning id into cli;
  insert into jobsites (client_id, name, address, frequency, latitude, longitude)
  values (cli, 'Sede DS', '1 Main St', '{"kind":"other","days":[]}', 26.1421, -81.7948) returning id into js;
  insert into ids values ('js', js);
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (js, pg_temp.pid('humbe'), cc_today() - 60) returning id into a;
  insert into assignment_pay (assignment_id, kind, fixed_amount, fixed_period, effective_from) values (a, 'fixed', 80, 'visit', cc_today() - 60);
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (js, pg_temp.pid('karina'), cc_today() - 60) returning id into a;
  insert into assignment_pay (assignment_id, kind, fixed_amount, fixed_period, effective_from) values (a, 'fixed', 80, 'visit', cc_today() - 60);
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (js, pg_temp.pid('estela'), cc_today() - 60) returning id into a;
  insert into assignment_pay (assignment_id, kind, fixed_amount, fixed_period, effective_from) values (a, 'fixed', 1350, 'month', cc_today() - 60);
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (js, pg_temp.pid('ana'), cc_today() - 60) returning id into a;
  insert into assignment_pay (assignment_id, kind, hourly_rate, effective_from) values (a, 'hourly', 18, cc_today() - 60);
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (js, pg_temp.pid('lalo'), cc_today() - 60) returning id into a;
  insert into ids values ('lalo_a', a);
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js, now() - interval '5 hours', 240, local_day(now() - interval '5 hours')) returning id into v;
  insert into ids values ('ve', v);
  insert into visit_staff (visit_id, profile_id) select v, pg_temp.pid(x) from unnest(array['humbe', 'estela', 'karina']) x;
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js, now() - interval '30 hours', 240, local_day(now() - interval '30 hours')) returning id into v;
  insert into ids values ('vy', v);
  insert into visit_staff (visit_id, profile_id) select v, pg_temp.pid(x) from unnest(array['humbe', 'ana']) x;
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js, now() + interval '3 days', 240, local_day(now() + interval '3 days')) returning id into v;
  insert into ids values ('vf', v);
  insert into visit_staff (visit_id, profile_id) values (v, pg_temp.pid('humbe'));
end $$;

-- 1. 1099 sin horas, sin GPS (D-275)
select pg_temp.prueba('1099: clock in no', 'ERR:42501:contractor_no_hours',
  pg_temp.valor('humbe', format('select clock_in(%L, gen_random_uuid(), now(), 26.1421, -81.7948, false)::text', pg_temp.id('ve'))));
select pg_temp.prueba('1099: clock out no', 'ERR:42501:contractor_no_hours',
  pg_temp.valor('humbe', format('select clock_out(%L, now(), 26.1421, -81.7948, false)::text', gen_random_uuid())));
select pg_temp.prueba('1099: registro de ubicación no', 'ERR:42501:contractor_no_hours',
  pg_temp.valor('humbe', format('select visit_distance(%L, 26.1421, -81.7948)::text', pg_temp.id('ve'))));
select pg_temp.prueba('1099: Mis horas no', 'ERR:42501:contractor_no_hours', pg_temp.valor('humbe', $q$select my_hours('2026-10-01')::text$q$));
select pg_temp.prueba('el admin no registra horas a un 1099', 'ERR:22023:contractor_no_hours',
  pg_temp.valor('sup', format('select record_work(%L, %L)::text', pg_temp.id('ve'),
    jsonb_build_array(jsonb_build_object('profile_id', pg_temp.pid('karina'), 'clock_in', now() - interval '5 hours', 'clock_out', now() - interval '1 hour'))::text)));
select pg_temp.prueba('el automático no llena a los 1099 sin acceso', '0',
  (select count(*) from (select fill_auto_work()) f, work_entries w where w.visit_id = pg_temp.id('ve'))::text);

-- 2. W-2 con ubicación obligatoria (D-277 (2))
select pg_temp.prueba('W-2: clock in sin ubicación no', 'ERR:22023:location_required',
  pg_temp.valor('ana', format('select clock_in(%L, gen_random_uuid(), now(), null, null, false)::text', pg_temp.id('vy'))));
select pg_temp.prueba('W-2: con ubicación sí', 'ok',
  pg_temp.valor('ana', format('select clock_in(%L, gen_random_uuid(), now() - interval ''29 hours'', 26.1421, -81.7948, true)->>''status''', pg_temp.id('vy'))));
select pg_temp.prueba('W-2: clock out sin ubicación no', 'ERR:22023:location_required',
  pg_temp.valor('ana', format('select clock_out(%L, now(), null, null, false)::text', (select id from work_entries where profile_id = pg_temp.pid('ana')))));
select pg_temp.prueba('W-2: clock out con ubicación sí', 'ok',
  pg_temp.valor('ana', format('select clock_out(%L, now() - interval ''27 hours'', 26.1421, -81.7948, true)->>''status''', (select id from work_entries where profile_id = pg_temp.pid('ana')))));

-- 3. Pago por día (D-276)
select pg_temp.prueba('al 1099 no se le define pago por hora', 'ERR:22023:contractor_no_hours',
  pg_temp.valor('admin', format('select set_assignment_pay(%L, ''hourly'', 20, 4, null, null, %L)::text', pg_temp.id('lalo_a'), cc_today())));
select pg_temp.prueba('al 1099 sí pago fijo por visita', '',
  pg_temp.valor('admin', format('select set_assignment_pay(%L, ''fixed'', null, null, 80, ''visit'', %L)::text', pg_temp.id('lalo_a'), cc_today())));
select pg_temp.prueba('monto del día según el pago del jobsite: fijo por visita $80', '80.00', service_day_pay(pg_temp.id('ve'), pg_temp.pid('humbe'))::text);
select pg_temp.prueba('fijo mensual: el día vale 0 (el mes se cuenta aparte)', '0', service_day_pay(pg_temp.id('ve'), pg_temp.pid('estela'))::text);

-- 4. El 1099 marca su día (D-275, D-286 (1))
select pg_temp.prueba('marcar una visita futura no', 'ERR:22023:not_yet',
  pg_temp.valor('humbe', format('select complete_service_day(%L)::text', pg_temp.id('vf'))));
select pg_temp.prueba('un W-2 no marca días de servicio', 'ERR:42501:not_contractor',
  pg_temp.valor('ana', format('select complete_service_day(%L)::text', pg_temp.id('ve'))));
select pg_temp.prueba('el 1099 marca Completado: queda pendiente', 'pending',
  pg_temp.valor('humbe', format('select complete_service_day(%L)->>''status''', pg_temp.id('ve'))));
select pg_temp.prueba('marcar dos veces no duplica', '1', (select count(*) from service_days where profile_id = pg_temp.pid('humbe'))::text);
select pg_temp.prueba('sin horas ni ubicación en el día', 'f',
  (select (count(*) > 0)::text::char(1) from work_entries where profile_id = pg_temp.pid('humbe')));
select pg_temp.prueba('el día queda en el historial', '1', (select count(*) from change_log where action = 'dia_marcado')::text);
select pg_temp.prueba('la visita sale en To approve con el día pendiente', 'day_pending',
  pg_temp.valor('aprob', format($q$select r->>'status' from jsonb_array_elements((select x from jsonb_array_elements(work_to_approve()) x where x->>'id' = %L)->'rows') r where r->>'profile_id' = %L$q$,
    pg_temp.id('ve'), pg_temp.pid('humbe'))));
select pg_temp.prueba('quien no tiene acceso aparece sin día (Registrar y aprobar)', 'day_missing|false',
  pg_temp.valor('aprob', format($q$select (r->>'status') || '|' || (r->>'has_app_access') from jsonb_array_elements(visit_work(%L)->'rows') r where r->>'profile_id' = %L$q$,
    pg_temp.id('ve'), pg_temp.pid('karina'))));

-- 5. Devolver con nota y volver a marcar
select pg_temp.prueba('devolver sin nota no', 'ERR:22023:note_required',
  pg_temp.valor('aprob', format('select return_service_day(%L, ''  '')::text', (select id from service_days where profile_id = pg_temp.pid('humbe')))));
select pg_temp.prueba('devolver sin el permiso no', 'ERR:42501',
  left(pg_temp.valor('sup', format('select return_service_day(%L, ''x'')::text', (select id from service_days where profile_id = pg_temp.pid('humbe')))), 9));
select pg_temp.valor('aprob', format('select return_service_day(%L, ''Faltó sacar la basura del muelle.'')::text', (select id from service_days where profile_id = pg_temp.pid('humbe'))));
select pg_temp.prueba('devuelto: Requiere corrección con la nota', 'needs_correction|Faltó sacar la basura del muelle.',
  (select status || '|' || note from service_days where profile_id = pg_temp.pid('humbe')));
select pg_temp.prueba('el 1099 recibe un aviso al devolverlo', '1',
  (select count(*) from notifications where profile_id = pg_temp.pid('humbe') and kind = 'service_day_returned')::text);
select pg_temp.prueba('Mis días: la nota del admin se ve', 'needs_correction|Faltó sacar la basura del muelle.|1',
  pg_temp.valor('humbe', format($q$select (d->'rows'->0->>'status') || '|' || (d->'rows'->0->>'note') || '|' || (d->>'needs_correction') from my_service_days(%L) d$q$, cc_today())));
select pg_temp.prueba('no se aprueba mientras requiere corrección', 'ERR:22023:needs_correction',
  pg_temp.valor('aprob', format('select approve_service_day(%L)::text', (select id from service_days where profile_id = pg_temp.pid('humbe')))));
select pg_temp.prueba('el 1099 lo marca de nuevo: pendiente', 'pending',
  pg_temp.valor('humbe', format('select complete_service_day(%L)->>''status''', pg_temp.id('ve'))));

-- 6. Aprobar, registrar y aprobar, no show (D-286 (3), D-266)
select pg_temp.prueba('aprobar sin el permiso no', 'ERR:42501',
  left(pg_temp.valor('sup', format('select approve_service_day(%L)::text', (select id from service_days where profile_id = pg_temp.pid('humbe')))), 9));
select pg_temp.valor('aprob', format('select approve_service_day(%L)::text', (select id from service_days where profile_id = pg_temp.pid('humbe'))));
select pg_temp.prueba('aprobado con el monto del jobsite', 'approved|80.00|f',
  (select status || '|' || amount || '|' || amount_edited::text::char(1) from service_days where profile_id = pg_temp.pid('humbe')));
select pg_temp.prueba('la visita sigue abierta mientras faltan otros', 'false',
  (select (approved_at is not null)::text from visits where id = pg_temp.id('ve')));
select pg_temp.prueba('registrar y aprobar necesita registrar y aprobar', 'ERR:42501',
  left(pg_temp.valor('sup', format('select record_and_approve_service_day(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('karina'))), 9));
select pg_temp.valor('admin', format('select record_and_approve_service_day(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('karina')));
select pg_temp.prueba('karina: registrado y aprobado en un paso', 'approved|80.00',
  (select status || '|' || amount from service_days where profile_id = pg_temp.pid('karina')));
select pg_temp.prueba('registrar y aprobar a un W-2 no', 'ERR:22023:not_contractor',
  pg_temp.valor('admin', format('select record_and_approve_service_day(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('ana'))));
select pg_temp.prueba('aprobar la visita con un 1099 sin resolver no', 'ERR:22023:service_days_pending',
  pg_temp.valor('aprob', format('select approve_visit(%L)::text', pg_temp.id('ve'))));
select pg_temp.prueba('+ Agregar persona: lalo (1099, sustituto) se puede agregar', 'true',
  pg_temp.valor('admin', format($q$select (work_addable_staff(%L) @> jsonb_build_array(jsonb_build_object('id', %L::uuid, 'worker_type', '1099')))::text$q$,
    pg_temp.id('ve'), pg_temp.pid('lalo'))));
select pg_temp.valor('admin', format('select mark_no_show(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('estela')));
select pg_temp.prueba('No show de estela: la visita se cierra sola (todo aprobado)', 'true',
  (select (approved_at is not null)::text from visits where id = pg_temp.id('ve')));
select pg_temp.prueba('visita cerrada: ya no sale en To approve', 'false',
  pg_temp.valor('aprob', format($q$select (work_to_approve() @> jsonb_build_array(jsonb_build_object('id', %L::uuid)))::text$q$, pg_temp.id('ve'))));
select pg_temp.prueba('sustituto en visita cerrada: solo el Super Admin', 'ERR:22023',
  left(pg_temp.valor('admin', format('select record_and_approve_service_day(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('lalo'))), 9));
select pg_temp.prueba('el Super Admin agrega al sustituto aprobado (D-262)', 'uuid',
  left(pg_temp.valor('super', format('select pg_typeof(record_and_approve_service_day(%L, %L))::text', pg_temp.id('ve'), pg_temp.pid('lalo'))), 4));
select pg_temp.prueba('el sustituto queda aprobado y sin programar', 'approved|t',
  (select status || '|' || unscheduled::text::char(1) from service_days where profile_id = pg_temp.pid('lalo')));

-- 7. Editar el monto (D-276)
select pg_temp.prueba('editar el monto sin nota no', 'ERR:22023:note_required',
  pg_temp.valor('super', format('select edit_service_day_amount(%L, 60, '''')::text', (select id from service_days where profile_id = pg_temp.pid('karina')))));
select pg_temp.prueba('un día aprobado: el admin no edita el monto (solo el Super Admin)', 'ERR:22023:already_approved',
  pg_temp.valor('admin', format('select edit_service_day_amount(%L, 60, ''Medio día'')::text', (select id from service_days where profile_id = pg_temp.pid('karina')))));
select pg_temp.valor('super', format('select edit_service_day_amount(%L, 60, ''Medio día'')::text', (select id from service_days where profile_id = pg_temp.pid('karina'))));
select pg_temp.prueba('monto editado', '60.00|t|Medio día',
  (select amount || '|' || amount_edited::text::char(1) || '|' || amount_note from service_days where profile_id = pg_temp.pid('karina')));
select pg_temp.prueba('la edición queda en el historial con antes y después', '80.00|60.00',
  (select (detail->>'antes') || '|' || (detail->>'despues') from change_log where action = 'dia_monto_editado' order by id desc limit 1));
select pg_temp.valor('super', format('select return_service_day(%L, ''Revisar'')::text', (select id from service_days where profile_id = pg_temp.pid('lalo'))));
select pg_temp.prueba('el Super Admin devuelve un día aprobado (D-262)', 'needs_correction',
  (select status from service_days where profile_id = pg_temp.pid('lalo')));
select pg_temp.prueba('el admin no devuelve un día aprobado', 'ERR:22023:already_approved',
  pg_temp.valor('aprob', format('select return_service_day(%L, ''x'')::text', (select id from service_days where profile_id = pg_temp.pid('karina')))));
select pg_temp.valor('admin', format('select mark_no_show(%L, %L)::text', pg_temp.id('ve'), pg_temp.pid('lalo')));

-- 8. Costo, estado de cuenta (D-286 (4))
insert into service_days (visit_id, profile_id, status, amount, marked_by, marked_at)
values (pg_temp.id('vy'), pg_temp.pid('humbe'), 'pending', null, pg_temp.pid('humbe'), now());
select pg_temp.prueba('solo los días aprobados cuentan para el pago (humbe $80, karina $60)', '80.00|60.00',
  (select string_agg(r.amount::text, '|' order by p.full_name)
     from staff_cost_rows(cc_today(), cc_today()) r join profiles p on p.id = r.profile_id
    where r.profile_id in (pg_temp.pid('humbe'), pg_temp.pid('karina'))));
select pg_temp.prueba('el fijo mensual sigue (estela no show: sin día, no cuenta)', '0',
  (select count(*) from staff_cost_rows(cc_today(), cc_today()) r where r.profile_id = pg_temp.pid('estela'))::text);
select pg_temp.prueba('estado de cuenta sin permiso no', 'ERR:42501',
  left(pg_temp.valor('aprob', format('select service_day_statement(%L)::text', cc_today())), 9));
select pg_temp.prueba('estado de cuenta: cierre el último día del mes, pago 7 días después', 't',
  pg_temp.valor('admin', format($q$select ((s->>'closes_on')::date = month_end(%L) and (s->>'due_on')::date = month_end(%L) + 7)::text::char(1) from service_day_statement(%L) s$q$, cc_today(), cc_today(), cc_today())));
select pg_temp.prueba('estado de cuenta: humbe 1 día $80, karina 1 día editado $60', '1|0|80.00,1|1|60.00',
  pg_temp.valor('admin', format($q$select string_agg((r->>'days') || '|' || (r->>'edited') || '|' || (r->>'amount'), ',' order by r->>'name')
      from jsonb_array_elements(service_day_statement(%L)->'rows') r where (r->>'profile_id')::uuid in (%L, %L)$q$, cc_today(), pg_temp.pid('humbe'), pg_temp.pid('karina'))));
select pg_temp.prueba('Accounting: personal con días del 1099', '1',
  pg_temp.valor('admin', format($q$select x->>'days' from jsonb_array_elements(staff_cost(%L, %L)) x where (x->>'profile_id')::uuid = %L$q$, cc_today(), cc_today(), pg_temp.pid('humbe'))));

-- 9. Mis días de servicio y horario (D-279)
select pg_temp.prueba('Mis días: humbe ve sus días del mes, sin dinero ni horas', 'false',
  pg_temp.valor('humbe', format($q$select (my_service_days(%L)::text ~* 'amount|minutes|clock|lat|lng')::text$q$, cc_today())));
select pg_temp.prueba('el horario del 1099 lleva su día de servicio', 'approved',
  pg_temp.valor('humbe', format($q$select x->'service_day'->>'status' from jsonb_array_elements(my_schedule()) x where x->>'id' = %L$q$, pg_temp.id('ve'))));
update profiles set worker_type = 'w2' where id = pg_temp.pid('lalo');
select pg_temp.prueba('el cambio de tipo W-2 ↔ 1099 queda en el historial', '1099|w2',
  (select (detail->'antes'->>'worker_type') || '|' || (detail->'despues'->>'worker_type') from change_log
    where action = 'perfil_cambiado' and entity_id = pg_temp.pid('lalo') order by id desc limit 1));
update profiles set worker_type = '1099' where id = pg_temp.pid('lalo');

-- 10. Estadísticas e Inicio del admin
select pg_temp.prueba('Estadísticas: los días aprobados de humbe cuentan como días de servicio', '1',
  (stats_entry_figures(month_start(cc_today()), month_end(cc_today()), null, pg_temp.pid('humbe'))->>'service_days'));
select pg_temp.prueba('Inicio del admin: el día pendiente de humbe (ayer) cuenta por aprobar', 'true',
  pg_temp.valor('admin', $q$select ((admin_home()->'to_approve'->>'service_days')::int >= 1)::text$q$));
select pg_temp.prueba('Inicio del admin: las horas de la semana no incluyen 1099', '0',
  pg_temp.valor('super', format($q$select count(*)::text from jsonb_array_elements(coalesce(admin_home()->'week_hours', '[]')) x where (x->>'profile_id')::uuid in (%L, %L)$q$,
    pg_temp.pid('humbe'), pg_temp.pid('karina'))));

-- 11. Conversión de los registros de 1099 (D-277 (1))
delete from service_days where profile_id = pg_temp.pid('humbe') and visit_id = pg_temp.id('vy');
insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, in_distance_m, out_distance_m, pay_minutes, pay_amount)
values (pg_temp.id('vy'), pg_temp.pid('humbe'), now() - interval '30 hours', now() - interval '27 hours', 'ok', 'ok', 20, 30, 240, 80);
insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at)
values (pg_temp.id('js'), now() - interval '50 hours', 240, local_day(now() - interval '50 hours'), now() - interval '40 hours');
insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, pay_minutes, pay_amount)
select id, pg_temp.pid('karina'), starts_at, starts_at + interval '4 hours', 'auto', 'auto', 240, 72.5 from visits
 where jobsite_id = pg_temp.id('js') and approved_at is not null and id <> pg_temp.id('ve');
\i supabase/migrations/20261030000007_convertir_1099.sql
select pg_temp.prueba('conversión: quedan 0 filas de horas/GPS de 1099', '0',
  (select count(*) from work_entries w join profiles p on p.id = w.profile_id where p.worker_type = '1099')::text);
select pg_temp.prueba('conversión: lo aprobado pasa a día aprobado con su pay_amount', 'approved|72.50',
  (select d.status || '|' || d.amount from service_days d join visits v on v.id = d.visit_id
    where d.profile_id = pg_temp.pid('karina') and v.id <> pg_temp.id('ve')));
select pg_temp.prueba('conversión: lo no aprobado pasa a día pendiente sin monto', 'pending|',
  (select status || '|' || coalesce(amount::text, '') from service_days where profile_id = pg_temp.pid('humbe') and visit_id = pg_temp.id('vy')));
select pg_temp.prueba('conversión: las horas del W-2 siguen', '1',
  (select count(*) from work_entries where profile_id = pg_temp.pid('ana'))::text);

select n, prueba, ok, detalle from resultados order by n;
rollback;
