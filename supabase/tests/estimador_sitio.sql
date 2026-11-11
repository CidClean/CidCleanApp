-- Pruebas del estimador del sitio (orden 91; D-014, D-200, D-301, D-309; migración 20261113000001).
-- Repetibles: todo termina en rollback. Uso (desde la raíz del repositorio): psql -f supabase/tests/estimador_sitio.sql
-- (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
grant all on resultados, actores to public;

create function pg_temp.valor_aal(quien text, aal text, consulta text) returns text language plpgsql as $$
declare
  resultado text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select auth_id from actores where nombre = quien),
                     'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate;
  end;
  reset role;
  return resultado;
end $$;
create function pg_temp.como(rol text, consulta text) returns text language plpgsql as $$
declare
  resultado text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', rol)::text, true);
  execute format('set local role %I', rol);
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
create function pg_temp.rango(sqft numeric, tipo text, frec text) returns text language sql as $$
  select '$' || to_char(q.range_low, 'FM9,999') || '–$' || to_char(q.range_high, 'FM9,999')
  from estimate_quote(sqft,
    (select (x->>'rate')::numeric from estimator_settings, jsonb_array_elements(place_types) x where x->>'key' = tipo),
    (select (x->>'visits_per_month')::numeric from estimator_settings, jsonb_array_elements(frequencies) x where x->>'key' = frec),
    (select (x->>'adjustment')::numeric from estimator_settings, jsonb_array_elements(frequencies) x where x->>'key' = frec),
    (select min_per_visit from estimator_settings), (select range_pct from estimator_settings),
    (select round_to from estimator_settings)) q
$$;
create function pg_temp.envio(kind text, correo text, ip text, tipo text default 'office', sqft int default 3000,
                              frec text default 'weekly_3', ciudad text default 'Naples', zip text default '34102',
                              empresa text default '', mensaje text default null) returns jsonb language sql as $$
  select site_submit(kind, 'Ana Prueba', empresa, correo, '(239) 555-0101', ciudad, zip, tipo, sqft, frec, mensaje, ip)
$$;

-- Personas: super (el Super Admin que ya existe) y admin (con todos los permisos de Ventas, no es Super Admin).
do $$
declare
  pid uuid;
  aid uuid;
begin
  aid := gen_random_uuid();
  insert into profiles (full_name, worker_type, role, email, has_app_access)
  values ('Prueba admin', 'w2', 'admin', 'admin@prueba-est.local', true) returning id into pid;
  insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'admin@prueba-est.local');
  update profiles set auth_user_id = aid where id = pid;
  insert into actores values ('admin', aid, pid);
  insert into profile_permissions (profile_id, permission_key) values (pid, 'leads_ver'), (pid, 'leads_editar');
  select id, auth_user_id into pid, aid from profiles where is_super_admin;
  if aid is null then
    aid := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-est.local');
    update profiles set auth_user_id = aid where id = pid;
  end if;
  insert into actores values ('super', aid, pid);
end $$;

-- ===== Tabla y tarifas de D-309 =====
select pg_temp.prueba('una sola fila', '1', (select count(*)::text from estimator_settings));
select pg_temp.prueba('tarifa Office 0.040', '0.040', (select x->>'rate' from estimator_settings, jsonb_array_elements(place_types) x where x->>'key' = 'office'));
select pg_temp.prueba('tarifa Medical 0.065', '0.065', (select x->>'rate' from estimator_settings, jsonb_array_elements(place_types) x where x->>'key' = 'medical'));
select pg_temp.prueba('tarifa Warehouse 0.020', '0.020', (select x->>'rate' from estimator_settings, jsonb_array_elements(place_types) x where x->>'key' = 'warehouse'));
select pg_temp.prueba('7 tipos y 6 frecuencias', '7|6', (select jsonb_array_length(place_types) || '|' || jsonb_array_length(frequencies) from estimator_settings));
select pg_temp.prueba('3x por semana: 13 visitas × 0.85', '13|0.85', (select (x->>'visits_per_month') || '|' || (x->>'adjustment') from estimator_settings, jsonb_array_elements(frequencies) x where x->>'key' = 'weekly_3'));
select pg_temp.prueba('mínimo 85, rango 0.15, redondeo 10, umbral 25000', '85.00|0.1500|10|25000',
  (select min_per_visit || '|' || range_pct || '|' || round_to || '|' || walkthrough_sqft from estimator_settings));
select pg_temp.prueba('no se puede insertar una segunda fila', 'ERR', (select left(pg_temp.como('service_role', $q$insert into estimator_settings (id, place_types, frequencies, min_per_visit, range_pct, round_to, walkthrough_sqft) select false, place_types, frequencies, 85, 0.15, 10, 25000 from estimator_settings returning 'x'$q$), 3)));

-- ===== Fórmula: los ejemplos de D-309 =====
select pg_temp.prueba('oficina 3,000 sq ft 3x/semana', '$1,130–$1,520', pg_temp.rango(3000, 'office', 'weekly_3'));
select pg_temp.prueba('medical 2,000 sq ft 3x/semana', '$1,220–$1,650', pg_temp.rango(2000, 'medical', 'weekly_3'));
select pg_temp.prueba('retail 1,500 sq ft 1x/semana (mínimo)', '$310–$420', pg_temp.rango(1500, 'retail', 'weekly_1'));
select pg_temp.prueba('warehouse 20,000 sq ft 2x/semana', '$2,710–$3,670', pg_temp.rango(20000, 'warehouse', 'weekly_2'));
select pg_temp.prueba('por visita con mínimo', '85.00', (select per_visit::text from estimate_quote(500, 0.04, 4.33, 1, 85, 0.15, 10)));
select pg_temp.prueba('por visita oficina 3,000 3x', '102.00', (select per_visit::text from estimate_quote(3000, 0.04, 13, 0.85, 85, 0.15, 10)));

-- ===== RLS: solo el Super Admin (con aal2) =====
select pg_temp.prueba('Super Admin aal2 lee', '85.00', pg_temp.valor_aal('super', 'aal2', 'select min_per_visit::text from estimator_settings'));
select pg_temp.prueba('Super Admin aal1 no ve la fila', null, pg_temp.valor_aal('super', 'aal1', 'select min_per_visit::text from estimator_settings'));
select pg_temp.prueba('admin no ve la fila', null, pg_temp.valor_aal('admin', 'aal1', 'select min_per_visit::text from estimator_settings'));
select pg_temp.prueba('anon no lee', 'ERR:42501', pg_temp.como('anon', 'select min_per_visit::text from estimator_settings'));
select pg_temp.prueba('admin no cambia', null, pg_temp.valor_aal('admin', 'aal1', 'update estimator_settings set min_per_visit = 1 returning min_per_visit::text'));
select pg_temp.prueba('Super Admin cambia el mínimo', '90.00', pg_temp.valor_aal('super', 'aal2', 'update estimator_settings set min_per_visit = 90 returning min_per_visit::text'));
select pg_temp.prueba('el cambio queda en el historial', '1', (select count(*)::text from change_log where action = 'estimador_tarifas_cambiadas'));
select pg_temp.prueba('Super Admin cambia una tarifa', '0.05', pg_temp.valor_aal('super', 'aal2',
  $q$update estimator_settings set place_types = jsonb_set(place_types, '{0,rate}', '0.05') returning place_types->0->>'rate'$q$));
select pg_temp.prueba('tarifa negativa rechazada', 'ERR:22023', pg_temp.valor_aal('super', 'aal2',
  $q$update estimator_settings set place_types = jsonb_set(place_types, '{0,rate}', '-1') returning 'x'$q$));
select pg_temp.prueba('nombre vacío rechazado', 'ERR:22023', pg_temp.valor_aal('super', 'aal2',
  $q$update estimator_settings set frequencies = jsonb_set(frequencies, '{0,name}', '""') returning 'x'$q$));
select pg_temp.prueba('cambiar una clave rechazado', 'ERR:22023', pg_temp.valor_aal('super', 'aal2',
  $q$update estimator_settings set place_types = jsonb_set(place_types, '{0,key}', '"oficina"') returning 'x'$q$));
select pg_temp.prueba('rango 1 rechazado', 'ERR:23514', pg_temp.valor_aal('super', 'aal2', 'update estimator_settings set range_pct = 1 returning range_pct::text'));
select pg_temp.prueba('nadie de la API llama a site_submit', 'ERR:42501', pg_temp.como('anon', $q$select site_submit('estimate','a','','a@b.co','2395550101','Naples','','office',3000,'weekly_3',null,null)::text$q$));
select pg_temp.prueba('authenticated tampoco', 'ERR:42501', pg_temp.valor_aal('super', 'aal2', $q$select site_submit('estimate','a','','a@b.co','2395550101','Naples','','office',3000,'weekly_3',null,null)::text$q$));
-- Se vuelve a las tarifas de D-309 para las pruebas de site_submit.
update estimator_settings set min_per_visit = 85, place_types = jsonb_set(place_types, '{0,rate}', '0.040');

-- ===== site_submit =====
select pg_temp.prueba('estimado crea lead', 'ok|true|1130|1520|false',
  (select r->>'status' || '|' || (r->>'new_lead') || '|' || (r->>'range_low') || '|' || (r->>'range_high') || '|' || (r->>'walkthrough_recommended')
   from pg_temp.envio('estimate', 'Ana@Prueba-Est.local', 'ip1') r));
select pg_temp.prueba('lead web, nuevo, no residencial, company = nombre', 'web|new|non_residential|Ana Prueba|ana@prueba-est.local',
  (select source || '|' || status || '|' || cleaning_type || '|' || company || '|' || email from leads where email = 'ana@prueba-est.local'));
select pg_temp.prueba('nota con tipo, sq ft, frecuencia, ciudad, ZIP y rango', 'true',
  (select (notes like '%Type: Office%' and notes like '%Size: 3,000 sq ft%' and notes like '%Frequency: 3x per week%'
           and notes like '%City: Naples%' and notes like '%ZIP: 34102%' and notes like '%$1,130 – $1,520%')::text
   from leads where email = 'ana@prueba-est.local'));
select pg_temp.prueba('lead_site con la ciudad, FL y ZIP, para completar', 'Naples, FL 34102|true',
  (select s.address || '|' || s.address_needs_review from lead_sites s join leads l on l.id = s.lead_id where l.email = 'ana@prueba-est.local'));
select pg_temp.prueba('mismo correo con lead abierto: agrega nota, no duplica', 'ok|false|1',
  (select r->>'status' || '|' || (r->>'new_lead') || '|' || (select count(*) from leads where email = 'ana@prueba-est.local')
   from pg_temp.envio('contact', 'ana@prueba-est.local', 'ip2', mensaje => 'Necesito limpieza los sábados') r));
select pg_temp.prueba('la nota del mensaje quedó en el mismo lead', 'true',
  (select (notes like '%Website estimate%' and notes like '%Necesito limpieza los sábados%')::text from leads where email = 'ana@prueba-est.local'));
select pg_temp.envio('estimate', 'luis@prueba-est.local', 'ip3', 'medical', 2000, empresa => 'Clínica Sol');
select pg_temp.prueba('empresa dada va en company', 'Clínica Sol|Ana Prueba',
  (select company || '|' || contact_name from leads where email = 'luis@prueba-est.local'));
select pg_temp.prueba('más de 25,000 sq ft recomienda walkthrough', 'true',
  (select r->>'walkthrough_recommended' from pg_temp.envio('estimate', 'grande@prueba-est.local', 'ip5', 'warehouse', 30000, 'weekly_1') r));
-- Lead ganado o perdido: el siguiente estimado del mismo correo crea un lead nuevo.
update leads set status = 'lost', lost_reason_id = (select id from lost_reasons order by sort limit 1) where email = 'luis@prueba-est.local';
select pg_temp.prueba('lead perdido: crea uno nuevo', 'true', (select r->>'new_lead' from pg_temp.envio('estimate', 'luis@prueba-est.local', 'ip6') r));
select pg_temp.prueba('ahora hay dos leads con ese correo', '2', (select count(*)::text from leads where email = 'luis@prueba-est.local'));
select pg_temp.envio('contact', 'otro@prueba-est.local', 'ip7', ciudad => 'Other', zip => '', mensaje => 'Hello, we are in Fort Myers.');
select pg_temp.prueba('ciudad Other sin ZIP: sitio "FL"', 'FL',
  (select s.address from lead_sites s join leads l on l.id = s.lead_id where l.email = 'otro@prueba-est.local'));
-- Validación
select pg_temp.prueba('sq ft fuera de rango', 'invalid', (select r->>'status' from pg_temp.envio('estimate', 'v1@prueba-est.local', 'ipv', sqft => 100) r));
select pg_temp.prueba('tipo desconocido', 'invalid', (select r->>'status' from pg_temp.envio('estimate', 'v2@prueba-est.local', 'ipv', tipo => 'castle') r));
select pg_temp.prueba('frecuencia desconocida', 'invalid', (select r->>'status' from pg_temp.envio('estimate', 'v3@prueba-est.local', 'ipv', frec => 'daily') r));
select pg_temp.prueba('ciudad fuera de la lista', 'invalid', (select r->>'status' from pg_temp.envio('estimate', 'v4@prueba-est.local', 'ipv', ciudad => 'Miami') r));
select pg_temp.prueba('ZIP mal formado', 'invalid', (select r->>'status' from pg_temp.envio('estimate', 'v5@prueba-est.local', 'ipv', zip => '341') r));
select pg_temp.prueba('correo mal formado', 'invalid', (select r->>'status' from pg_temp.envio('estimate', 'no-es-correo', 'ipv') r));
select pg_temp.prueba('contacto sin mensaje', 'invalid', (select r->>'status' from pg_temp.envio('contact', 'v6@prueba-est.local', 'ipv', mensaje => 'hi') r));
select pg_temp.prueba('lo inválido no crea leads', '0', (select count(*)::text from leads where email like 'v_@prueba-est.local'));
-- Límites (D-200): 3 por hora por correo, 5 por hora por IP.
select pg_temp.envio('estimate', 'lim@prueba-est.local', 'ipA'), pg_temp.envio('estimate', 'lim@prueba-est.local', 'ipB'),
       pg_temp.envio('estimate', 'lim@prueba-est.local', 'ipC');
select pg_temp.prueba('4.º envío del mismo correo en una hora', 'rate_limited', (select r->>'status' from pg_temp.envio('estimate', 'lim@prueba-est.local', 'ipD') r));
select pg_temp.envio('estimate', 'i' || g || '@prueba-est.local', 'ipX') from generate_series(1, 5) g;
select pg_temp.prueba('6.º envío de la misma IP en una hora', 'rate_limited', (select r->>'status' from pg_temp.envio('estimate', 'i6@prueba-est.local', 'ipX') r));
update site_submissions set created_at = now() - interval '2 hours' where ip_hash = 'ipX';
select pg_temp.prueba('envíos de hace más de una hora no cuentan', 'ok', (select r->>'status' from pg_temp.envio('estimate', 'i7@prueba-est.local', 'ipX') r));
select pg_temp.prueba('anon no lee site_submissions', 'ERR:42501', pg_temp.como('anon', 'select count(*)::text from site_submissions'));

select n, prueba, ok, detalle from resultados order by n;
rollback;
