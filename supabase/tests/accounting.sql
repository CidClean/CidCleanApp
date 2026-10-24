-- Pruebas de Accounting (migración 20261027000001, hito 7, orden 25; D-215, D-238). Repetibles: todo termina en rollback.
-- Uso: psql -f supabase/tests/accounting.sql (la última consulta lista cada prueba con ok = true/false).

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

do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['ing', 'cobra', 'dash', 'gas', 'gasv', 'rec', 'pers', 'exp', 'aprob', 'nada', 'e1', 'e2', 'e3', 'e4'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('ing', 'ingresos_ver_registrar'), ('ing', 'clientes_ver_tarifa'),
                 ('cobra', 'ingresos_ver_registrar'), ('cobra', 'clientes_ver_tarifa'), ('cobra', 'ingresos_marcar_recibidos'),
                 ('dash', 'dashboard_cuenta'), ('dash', 'clientes_ver_tarifa'),
                 ('gas', 'gastos_registrar_editar'), ('gasv', 'gastos_ver'), ('rec', 'gastos_recurrentes'),
                 ('pers', 'personal_ver_costo'), ('exp', 'reportes_exportar'), ('exp', 'personal_ver_costo'),
                 ('aprob', 'work_aprobar'), ('nada', 'ingresos_ver_registrar')) as p(n, k) on p.n = a.nombre;
end $$;

do $$
declare
  cli uuid;
  ja uuid;
  jb uuid;
  jc uuid;
  e_oct uuid;
  cat uuid := (select id from expense_categories where label_en = 'Insurance');
  sup uuid := (select id from expense_categories where label_en = 'Supplies');
  rid uuid;
  ryear uuid;
  v1 uuid;
  v2 uuid;
  v3 uuid;
  asg uuid;
  r text;
  pr record;
  p1 uuid := (select profile_id from actores where nombre = 'e1');
  p2 uuid := (select profile_id from actores where nombre = 'e2');
  p3 uuid := (select profile_id from actores where nombre = 'e3');
  p4 uuid := (select profile_id from actores where nombre = 'e4');
begin
  insert into clients (name, legacy) values ('Cliente Prueba Accounting', true) returning id into cli;
  insert into jobsites (client_id, name, address, frequency, start_date) values (cli, 'Sede Contable A', '1 Main St', '{"kind":"daily","days":[]}', '2026-10-15') returning id into ja;
  insert into jobsites (client_id, name, address, frequency, start_date) values (cli, 'Sede Contable B', '2 Main St', '{"kind":"daily","days":[]}', '2026-10-31') returning id into jb;
  insert into jobsites (client_id, name, address, frequency, start_date) values (cli, 'Sede Contable C', '3 Main St', '{"kind":"daily","days":[]}', '2026-10-01') returning id into jc;
  insert into jobsite_rates (jobsite_id, monthly_rate) values (ja, 1000), (jb, 500), (jc, 300);

  -- Generación (D-215): el día de inicio del contrato, mes completo, sin repetir.
  perform generate_accounting('2026-10-14');
  perform pg_temp.prueba('antes del día de inicio no se genera', '0', (select count(*) from income_expected where jobsite_id = ja)::text);
  perform generate_accounting('2026-10-15');
  perform pg_temp.prueba('el día de inicio se genera el mes completo con la tarifa vigente', '1000.00',
    (select amount::text from income_expected where jobsite_id = ja and month = '2026-10-01'));
  perform generate_accounting('2026-10-20');
  perform pg_temp.prueba('es idempotente', '1', (select count(*) from income_expected where jobsite_id = ja)::text);
  perform generate_accounting('2026-11-14');
  perform pg_temp.prueba('el mes siguiente espera al mismo día', '1', (select count(*) from income_expected where jobsite_id = ja)::text);
  perform generate_accounting('2026-11-15');
  perform pg_temp.prueba('y entonces genera noviembre', '2', (select count(*) from income_expected where jobsite_id = ja)::text);
  perform generate_accounting('2026-11-29');
  perform pg_temp.prueba('un contrato del 31 espera al último día del mes', '1', (select count(*) from income_expected where jobsite_id = jb)::text);
  perform generate_accounting('2026-11-30');
  perform pg_temp.prueba('y lo genera el 30 de noviembre', '2', (select count(*) from income_expected where jobsite_id = jb)::text);
  perform pg_temp.prueba('la generación queda en el historial', 'true',
    (select count(*) >= 2 from change_log where action = 'ingreso_generado' and entity_id = ja)::text);

  -- Pausado: no genera; al reactivarse no recupera los meses en pausa.
  delete from income_expected where jobsite_id = jc;
  update jobsites set status = 'paused', status_changed_at = '2026-10-02 12:00-04' where id = jc;
  perform generate_accounting('2026-11-05');
  perform pg_temp.prueba('pausado no genera', '0', (select count(*) from income_expected where jobsite_id = jc)::text);
  update jobsites set status = 'active', status_changed_at = '2026-12-02 12:00-05' where id = jc;
  perform generate_accounting('2026-12-05');
  perform pg_temp.prueba('reactivado genera solo desde el mes en que volvió', '2026-12-01',
    (select string_agg(month::text, ',') from income_expected where jobsite_id = jc));
  update jobsites set status = 'terminated' where id = jc;
  perform generate_accounting('2027-01-05');
  perform pg_temp.prueba('terminado no genera meses posteriores', '1', (select count(*) from income_expected where jobsite_id = jc)::text);

  -- Ajuste (D-238): permiso de ingresos, nota obligatoria, antes de recibido, en el historial.
  select id into e_oct from income_expected where jobsite_id = ja and month = '2026-10-01';
  perform pg_temp.prueba('ajustar sin nota no se puede', 'ERR:22023', pg_temp.valor('ing', format('select adjust_income(%L, 1100, %L)::text', e_oct, '  ')));
  perform pg_temp.prueba('sin ver tarifa no se ajusta', 'ERR:42501', pg_temp.valor('nada', format('select adjust_income(%L, 1100, %L)::text', e_oct, 'x')));
  perform pg_temp.prueba('sin permiso de ingresos no se ajusta', 'ERR:42501', pg_temp.valor('gas', format('select adjust_income(%L, 1100, %L)::text', e_oct, 'x')));
  perform pg_temp.valor('ing', format('select adjust_income(%L, 1100, %L)::text', e_oct, 'Extra hablado de palabra'));
  perform pg_temp.prueba('el ajuste guarda monto y nota', '1100.00|Extra hablado de palabra|1000.00',
    (select adjusted_amount || '|' || adjust_note || '|' || amount from income_expected where id = e_oct));
  perform pg_temp.prueba('el ajuste queda en el historial con antes, después y nota', '1000.00|1100.00|Extra hablado de palabra',
    (select (detail->>'antes') || '|' || (detail->>'despues') || '|' || (detail->>'nota') from change_log where action = 'ingreso_ajustado' and entity_id = ja order by id desc limit 1));
  perform generate_accounting('2026-10-25');
  perform pg_temp.prueba('generar otra vez no pisa lo calculado ni el ajuste', '1000.00|1100.00',
    (select amount || '|' || adjusted_amount from income_expected where id = e_oct));

  -- Recibido con fecha real.
  perform pg_temp.prueba('marcar recibido exige su permiso', 'ERR:42501', pg_temp.valor('ing', format('select set_income_received(%L, true, %L)::text', e_oct, '2026-10-20')));
  perform pg_temp.prueba('una fecha futura no vale', 'ERR:22023', pg_temp.valor('cobra', format('select set_income_received(%L, true, %L)::text', e_oct, cc_today() + 3)));
  perform pg_temp.valor('cobra', format('select set_income_received(%L, true, %L)::text', e_oct, '2026-10-20'));
  perform pg_temp.prueba('queda recibido con su fecha', 'true|2026-10-20', (select received || '|' || received_on from income_expected where id = e_oct));
  perform pg_temp.prueba('ya recibido no se ajusta', 'ERR:22023', pg_temp.valor('ing', format('select adjust_income(%L, 900, %L)::text', e_oct, 'x')));

  -- Un extra aceptado después de marcar recibido queda pendiente (D-200).
  insert into income_extras (jobsite_id, month, amount, label, service_date, created_at) values (ja, '2026-10-01', 50, 'Jueves extra', '2026-10-22', now() + interval '1 minute');
  perform pg_temp.prueba('total = ajuste + extra; recibido sin el extra posterior', '1100.00|50.00|1150.00|1100.00',
    (select (f).base || '|' || (f).extras || '|' || (f).total || '|' || (f).received from (select income_figures(e) f from income_expected e where id = e_oct) z));
  perform pg_temp.prueba('la lista de ingresos trae el extra', '1',
    pg_temp.valor('ing', format('select jsonb_array_length(x->''extras'') from jsonb_array_elements(list_income(%L, %L, %L)) x where x->>''id'' = %L', '2026-10-01', '2026-10-01', ja, e_oct)));
  perform pg_temp.prueba('ver ingresos exige ver tarifa', 'ERR:42501', pg_temp.valor('nada', format('select list_income(%L, %L)::text', '2026-10-01', '2026-10-01')));
  perform pg_temp.prueba('abrir ingresos queda en el historial', 'true', (select count(*) >= 1 from change_log where action = 'ingresos_abiertos')::text);

  -- Costo de personal (D-053, D-214, D-215): por hora con garantizadas, fija por visita, por semana y por mes.
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (ja, p1, '2026-10-01') returning id into asg;
  insert into assignment_pay (assignment_id, kind, hourly_rate, guaranteed_hours, effective_from) values (asg, 'hourly', 18, 3, '2026-10-01');
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (ja, p2, '2026-10-01') returning id into asg;
  insert into assignment_pay (assignment_id, kind, fixed_amount, fixed_period, effective_from) values (asg, 'fixed', 40, 'visit', '2026-10-01');
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (ja, p3, '2026-10-01') returning id into asg;
  insert into assignment_pay (assignment_id, kind, fixed_amount, fixed_period, effective_from) values (asg, 'fixed', 140, 'week', '2026-10-01');
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (ja, p4, '2026-10-16') returning id into asg;
  insert into assignment_pay (assignment_id, kind, fixed_amount, fixed_period, effective_from) values (asg, 'fixed', 700, 'month', '2026-10-16');
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (ja, '2026-10-20 09:00-04', 120, '2026-10-20') returning id into v1;
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (ja, '2026-10-21 09:00-04', 120, '2026-10-21') returning id into v2;
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (ja, '2026-12-02 09:00-05', 120, '2026-12-02') returning id into v3;
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status) values
    (v1, p1, '2026-10-20 09:00-04', '2026-10-20 11:00-04', 'ok', 'ok'),
    (v1, p2, '2026-10-20 09:00-04', '2026-10-20 11:00-04', 'ok', 'ok'),
    (v1, p4, '2026-10-20 09:00-04', '2026-10-20 10:00-04', 'ok', 'ok'),
    (v2, p2, '2026-10-21 09:00-04', '2026-10-21 10:00-04', 'ok', 'ok'),
    (v2, p3, '2026-10-21 09:00-04', '2026-10-21 10:00-04', 'ok', 'ok'),
    (v3, p3, '2026-12-02 09:00-05', '2026-12-02 10:00-05', 'ok', 'ok');
  perform pg_temp.prueba('sin aprobar no cuenta', '0', (select count(*) from staff_cost_rows('2026-10-01', '2026-12-01', ja))::text);
  perform pg_temp.valor('aprob', format('select approve_visit(%L)::text', v1));
  perform pg_temp.valor('aprob', format('select approve_visit(%L)::text', v2));
  perform pg_temp.valor('aprob', format('select approve_visit(%L)::text', v3));
  perform pg_temp.prueba('por hora con 3 h garantizadas: 2 h trabajadas pagan 3 h a $18', '54.00|180',
    (select amount || '|' || minutes from staff_cost_rows('2026-10-01', '2026-10-01', ja) where profile_id = p1));
  perform pg_temp.prueba('tarifa fija por visita: dos visitas', '80.00|180',
    (select amount || '|' || minutes from staff_cost_rows('2026-10-01', '2026-10-01', ja) where profile_id = p2));
  perform pg_temp.prueba('tarifa fija por semana con trabajo esa semana', '140.00',
    (select amount::text from staff_cost_rows('2026-10-01', '2026-10-01', ja) where profile_id = p3));
  perform pg_temp.prueba('tarifa fija por mes que empieza el 16: prorrateo por días (16/31)', '361.29',
    (select amount::text from staff_cost_rows('2026-10-01', '2026-10-01', ja) where profile_id = p4));
  perform pg_temp.prueba('una semana que cruza dos meses se reparte por días (2/7 y 5/7)', '40.00|100.00',
    (select string_agg(amount::text, '|' order by month) from staff_cost_rows('2026-11-01', '2026-12-01', ja) where profile_id = p3));
  perform pg_temp.prueba('el costo por empleado exige su permiso', 'ERR:42501', pg_temp.valor('ing', format('select staff_cost(%L, %L)::text', '2026-10-01', '2026-10-01')));
  perform pg_temp.prueba('lo que se debe por empleado en el mes', '4|635.29',
    pg_temp.valor('pers', format('select jsonb_array_length(c) || ''|'' || (select sum((x->>''amount'')::numeric) from jsonb_array_elements(c) x) from (select staff_cost(%L, %L, %L) c) z',
      '2026-10-01', '2026-10-01', ja)));
  perform pg_temp.prueba('abrir el costo de personal queda en el historial', 'true', (select count(*) >= 1 from change_log where action = 'costo_personal_abierto')::text);

  -- Gastos (D-065, D-098, D-130).
  perform pg_temp.prueba('registrar gastos exige su permiso', 'ERR:42501',
    pg_temp.valor('gasv', format('select save_expense(null, %L, %L, 100, null, %L)::text', sup, '2026-10-10', ja)));
  perform pg_temp.valor('gas', format('select save_expense(null, %L, %L, 100, %L, %L)::text', sup, '2026-10-10', 'Trapeadores', ja));
  perform pg_temp.prueba('el gasto queda con categoría, fecha, monto, nota y jobsite', '100.00|Trapeadores|2026-10-10',
    (select amount || '|' || note || '|' || spent_on from expenses where jobsite_id = ja and recurring_id is null));
  perform pg_temp.prueba('registrar el gasto queda en el historial', 'true', (select count(*) >= 1 from change_log where action = 'gasto_registrado')::text);
  perform pg_temp.prueba('ver gastos con gastos_ver', '1',
    pg_temp.valor('gasv', format('select jsonb_array_length(list_expenses(%L, %L, %L))', '2026-10-01', '2026-10-01', ja)));
  perform pg_temp.valor('gas', format('select save_expense(%L, %L, %L, 120, %L, %L)::text',
    (select id from expenses where jobsite_id = ja and recurring_id is null), sup, '2026-10-11', 'Trapeadores', ja));
  perform pg_temp.prueba('editar el gasto', '120.00|2026-10-11', (select amount || '|' || spent_on from expenses where jobsite_id = ja and recurring_id is null));
  perform pg_temp.prueba('las seis categorías de partida (D-130)', 'Suministros,Equipo,Seguro,Vehículos,Software,Otro',
    (select string_agg(label_es, ',' order by sort) from expense_categories));

  -- Profit de la cuenta (D-215): sobre lo esperado, con Recibido / Pendiente.
  perform pg_temp.prueba('dashboard por cuenta: esperado, recibido, pendiente, personal, gastos y profit', '1150.00|1100.00|50.00|635.29|120.00|394.71',
    pg_temp.valor('dash', format('select d->>''expected'' || ''|'' || (d->>''received'') || ''|'' || (d->>''pending'') || ''|'' || (d->>''staff'') || ''|'' || (d->>''expenses'') || ''|'' || (d->>''profit'') from (select accounting_dashboard(%L, %L, %L) d) z',
      '2026-10-01', '2026-10-01', ja)));
  perform pg_temp.prueba('el dashboard global exige su permiso', 'ERR:42501', pg_temp.valor('dash', format('select accounting_dashboard(%L, %L)::text', '2026-10-01', '2026-10-01')));
  perform pg_temp.prueba('abrir una cuenta queda en el historial', 'true', (select count(*) >= 1 from change_log where action = 'dashboard_cuenta_abierto' and entity_id = ja)::text);
  perform pg_temp.prueba('un rango al revés no vale', 'ERR:22023', pg_temp.valor('dash', format('select accounting_dashboard(%L, %L, %L)::text', '2026-11-01', '2026-10-01', ja)));

  -- Gastos recurrentes (D-103, D-215).
  perform pg_temp.prueba('gestionar recurrentes exige su permiso', 'ERR:42501',
    pg_temp.valor('gas', format('select save_recurring_expense(null, %L, %L, null, 200, %L, 1, null, true)::text', 'Seguro', cat, 'monthly')));
  rid := pg_temp.valor('rec', format('select save_recurring_expense(null, %L, %L, null, 200, %L, 1, null, true)::text', 'Seguro', cat, 'monthly'))::uuid;
  perform generate_accounting('2026-11-01');
  perform generate_accounting('2026-11-02');
  perform pg_temp.prueba('el mensual genera su gasto el día elegido, una vez', '1|2026-11-01|200.00',
    (select count(*) || '|' || min(spent_on) || '|' || min(amount) from expenses where recurring_id = rid));
  perform pg_temp.valor('rec', format('select set_recurring_active(%L, false)::text', rid));
  perform generate_accounting('2026-12-01');
  perform pg_temp.prueba('pausado no genera', '1', (select count(*) from expenses where recurring_id = rid)::text);
  perform pg_temp.prueba('pausar queda en el historial', 'true', (select count(*) >= 1 from change_log where action = 'gasto_recurrente_pausado' and entity_id = rid)::text);
  perform pg_temp.prueba('anual exige el mes', 'ERR:22023',
    pg_temp.valor('rec', format('select save_recurring_expense(null, %L, %L, null, 900, %L, 15, null, true)::text', 'Software', cat, 'yearly')));
  ryear := pg_temp.valor('rec', format('select save_recurring_expense(null, %L, %L, %L, 900, %L, 15, 3, true)::text', 'Licencia', cat, ja, 'yearly'))::uuid;
  perform generate_accounting('2027-02-15');
  perform pg_temp.prueba('anual no genera fuera de su mes', '0', (select count(*) from expenses where recurring_id = ryear)::text);
  perform generate_accounting('2027-03-15');
  perform pg_temp.prueba('anual genera en su día y mes', '1|2027-03-15', (select count(*) || '|' || min(spent_on) from expenses where recurring_id = ryear));
  perform pg_temp.prueba('la lista de recurrentes', '2', pg_temp.valor('rec', 'select jsonb_array_length(list_recurring_expenses())'));

  -- Exportes (D-215): devuelven filas; cada uno con su permiso.
  perform pg_temp.prueba('exportar costo de personal por empleado', '6',
    pg_temp.valor('exp', format('select count(*) from jsonb_array_elements(accounting_export(%L, %L, %L)) x where x->>''jobsite'' = %L',
      'staff', '2026-10-01', '2026-12-01', 'Sede Contable A')));
  perform pg_temp.prueba('exportar ingresos exige ver ingresos y tarifa', 'ERR:42501',
    pg_temp.valor('exp', format('select accounting_export(%L, %L, %L)::text', 'income', '2026-10-01', '2026-10-01')));
  perform pg_temp.prueba('exportar sin reportes_exportar no se puede', 'ERR:42501',
    pg_temp.valor('pers', format('select accounting_export(%L, %L, %L)::text', 'staff', '2026-10-01', '2026-10-01')));
  perform pg_temp.prueba('un reporte que no existe', 'ERR:22023',
    pg_temp.valor('exp', format('select accounting_export(%L, %L, %L)::text', 'otro', '2026-10-01', '2026-10-01')));
  perform pg_temp.prueba('exportar queda en el historial', 'true', (select count(*) >= 1 from change_log where action = 'reporte_exportado')::text);

  -- Las tablas nuevas no se leen ni escriben directo.
  perform pg_temp.prueba('income_expected no se lee directo', 'ERR:42501', pg_temp.valor('cobra', 'select count(*)::text from income_expected'));
  perform pg_temp.prueba('expenses no se escribe directo', 'ERR:42501',
    pg_temp.valor('gas', format('insert into expenses (category_id, spent_on, amount) values (%L, %L, 1) returning id::text', sup, '2026-10-01')));
  perform pg_temp.prueba('las categorías las lee quien ve gastos', '6', pg_temp.valor('gasv', 'select count(*)::text from expense_categories'));
  perform pg_temp.prueba('y solo el Super Admin las cambia', 'ERR:42501',
    pg_temp.valor('gasv', 'insert into expense_categories (label_es, label_en, sort) values (''X'', ''X'', 9) returning id::text'));
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
