-- Pruebas de la orden 160 (migraciones 20261122000001 y 20261122000002, D-347, D-348, D-350): fuentes de leads,
-- claves, RLS (solo Super Admin con aal2), lead_intake (solo service role), duplicados, avisos y reglas del lead.
-- Las funciones de la app se prueban como `authenticated` (set local role + request.jwt.claims; el Super Admin con
-- aal2). Repetibles: todo termina en rollback.
-- Uso: psql -f supabase/tests/lead_fuentes.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table ids (nombre text primary key, id uuid, txt text);
grant all on resultados, actores, ids to public;

-- Ejecuta una consulta como una persona autenticada (super1 = Super Admin con aal1), anon o la service role, y
-- devuelve el primer valor como texto, o 'ERR:' y el código de error si falla.
create function pg_temp.valor(quien text, consulta text) returns text language plpgsql as $$
declare
  resultado text;
  uid uuid;
begin
  if quien = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  elsif quien = 'servicio' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    set local role service_role;
  else
    select auth_id into uid from actores where nombre = case when quien = 'super1' then 'super' else quien end;
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
      'aal', case when quien = 'super1' then 'aal1' else 'aal2' end)::text, true);
    set local role authenticated;
  end if;
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return resultado;
end $$;

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

create function pg_temp.hash(k text) returns text language sql as $$ select encode(extensions.digest(k, 'sha256'), 'hex') $$;

-- Actores: ver (leads_ver), editor (leads_ver + leads_editar), sin (nada) y el Super Admin.
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['ver', 'editor', 'sin'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-lf.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-lf.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('ver', 'leads_ver'), ('editor', 'leads_ver'), ('editor', 'leads_editar')) as p(n, k) on p.n = a.nombre;
  select id, auth_user_id into pid, aid from profiles where is_super_admin;
  if aid is null then
    aid := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-lf.local');
    update profiles set auth_user_id = aid where id = pid;
  end if;
  update profiles set has_app_access = true, active = true where id = pid;
  insert into actores values ('super', aid, pid);
end $$;

do $$
declare
  r jsonb;
  k_meta text;
  k_muse text;
  k_otro text;
  v text;
  lead uuid;
begin
  -- Semillas
  perform pg_temp.prueba('semillas: 4 fuentes con su tipo, Enters as y Grok apagada',
    'Grok:agent:cold:false|Meta (Facebook + Instagram):ads:potential:true|Muse:agent:cold:true|TikTok:ads:potential:true',
    (select string_agg(name || ':' || kind || ':' || enters_as || ':' || active, '|' order by name) from lead_sources));
  perform pg_temp.prueba('semillas: sin clave guardada', '0', (select count(*)::text from lead_sources where key_hash is not null));

  -- RLS: solo el Super Admin con aal2
  perform pg_temp.prueba('anon no lee fuentes', 'ERR:42501', pg_temp.valor('anon', 'select count(*) from lead_sources'));
  perform pg_temp.prueba('editor de leads no ve fuentes', '0', pg_temp.valor('editor', 'select count(*) from lead_sources'));
  perform pg_temp.prueba('Super Admin con aal1 no ve fuentes', '0', pg_temp.valor('super1', 'select count(*) from lead_sources'));
  perform pg_temp.prueba('Super Admin con aal2 ve las 4', '4', pg_temp.valor('super', 'select count(*) from lead_sources'));
  perform pg_temp.prueba('nadie lee el hash de la clave desde la app', 'ERR:42501',
    pg_temp.valor('super', 'select key_hash from lead_sources limit 1'));
  perform pg_temp.prueba('editor no cambia una fuente', '0',
    pg_temp.valor('editor', $q$with u as (update lead_sources set active = false where name = 'Muse' returning 1) select count(*) from u$q$));
  perform pg_temp.prueba('Super Admin aal2 cambia "Enters as"', '1',
    pg_temp.valor('super', $q$with u as (update lead_sources set enters_as = 'cold' where name = 'TikTok' returning 1) select count(*) from u$q$));
  perform pg_temp.prueba('Super Admin no puede escribir el hash a mano', 'ERR:42501',
    pg_temp.valor('super', $q$update lead_sources set key_hash = repeat('a', 64) where name = 'TikTok'$q$));
  perform pg_temp.prueba('nadie borra fuentes', 'ERR:42501', pg_temp.valor('super', $q$delete from lead_sources where name = 'Grok'$q$));
  perform pg_temp.prueba('editar una fuente queda en el historial', '1',
    (select count(*)::text from change_log where action = 'fuente_lead_editada' and detail->>'name' = 'TikTok'));

  -- Crear y rehacer clave
  perform pg_temp.prueba('editor no crea fuentes', 'ERR:42501', pg_temp.valor('editor', $q$select lead_source_create('X', 'agent', 'cold')$q$));
  perform pg_temp.prueba('Super Admin aal1 no crea fuentes', 'ERR:42501', pg_temp.valor('super1', $q$select lead_source_create('X', 'agent', 'cold')$q$));
  perform pg_temp.prueba('tipo no válido', 'ERR:22023', pg_temp.valor('super', $q$select lead_source_create('X', 'robot', 'cold')$q$));
  perform pg_temp.prueba('nombre repetido', 'ERR:23505', pg_temp.valor('super', $q$select lead_source_create(' muse ', 'agent', 'cold')$q$));
  r := pg_temp.valor('super', $q$select lead_source_create('Otro agente', 'agent', 'cold')$q$)::jsonb;
  k_otro := r->>'key';
  perform pg_temp.prueba('crear devuelve la clave una vez (ccl_ + 48 hex) y sus últimos 4', 'true|true',
    (k_otro ~ '^ccl_[0-9a-f]{48}$')::text || '|' || (r->>'key_last4' = right(k_otro, 4))::text);
  perform pg_temp.prueba('se guarda el hash, no la clave', 'true|0',
    (select (key_hash = pg_temp.hash(k_otro))::text from lead_sources where name = 'Otro agente') || '|'
    || (select count(*)::text from lead_sources where key_hash = k_otro or key_last4 = k_otro));

  r := pg_temp.valor('super', format('select lead_source_rotate_key(%L)', (select id from lead_sources where name = 'Meta (Facebook + Instagram)')))::jsonb;
  k_meta := r->>'key';
  r := pg_temp.valor('super', format('select lead_source_rotate_key(%L)', (select id from lead_sources where name = 'Muse')))::jsonb;
  k_muse := r->>'key';
  r := pg_temp.valor('super', format('select lead_source_rotate_key(%L)', (select id from lead_sources where name = 'Otro agente')))::jsonb;
  perform pg_temp.prueba('rehacer: clave nueva distinta y la vieja ya no entra', 'true|unauthorized',
    (r->>'key' <> k_otro)::text || '|' ||
    (pg_temp.valor('servicio', format($q$select lead_intake(%L, '[{"contact_name":"A","email":"a@b.co"}]')->>'status'$q$, pg_temp.hash(k_otro)))));
  perform pg_temp.prueba('rehacer clave queda en el historial (sin la clave)', 'true',
    (select (count(*) >= 3 and bool_and(detail::text not like '%ccl_%'))::text from change_log where action = 'fuente_lead_clave'));
  perform pg_temp.prueba('editor no rehace claves', 'ERR:42501',
    pg_temp.valor('editor', format('select lead_source_rotate_key(%L)', (select id from lead_sources where name = 'Muse'))));

  -- lead_intake: solo service role
  perform pg_temp.prueba('la app no llama a lead_intake', 'ERR:42501',
    pg_temp.valor('super', format($q$select lead_intake(%L, '[]')$q$, pg_temp.hash(k_meta))));
  perform pg_temp.prueba('anon no llama a lead_intake', 'ERR:42501',
    pg_temp.valor('anon', format($q$select lead_intake(%L, '[]')$q$, pg_temp.hash(k_meta))));
  perform pg_temp.prueba('clave falsa: unauthorized', 'unauthorized',
    pg_temp.valor('servicio', format($q$select lead_intake(%L, '[{"contact_name":"A","email":"a@b.co"}]')->>'status'$q$, repeat('0', 64))));
  update lead_sources set key_hash = pg_temp.hash('ccl_grok'), key_last4 = 'grok' where name = 'Grok';
  perform pg_temp.prueba('fuente apagada: unauthorized', 'unauthorized',
    pg_temp.valor('servicio', format($q$select lead_intake(%L, '[{"contact_name":"A","email":"a@b.co"}]')->>'status'$q$, pg_temp.hash('ccl_grok'))));
  perform pg_temp.prueba('lote de más de 200: invalid', 'invalid',
    pg_temp.valor('servicio', format($q$select lead_intake(%L, (select jsonb_agg(jsonb_build_object('email', 'x' || g || '@b.co', 'contact_name', 'X')) from generate_series(1, 201) g))->>'status'$q$, pg_temp.hash(k_meta))));

  -- Potencial (Meta): Interesado, potential, aviso al momento
  r := pg_temp.valor('servicio', format($q$select lead_intake(%L, '[{"company":"<b>Gulf</b> Coast Dental","contact_name":"Dr. Patel","phone":"+1 (239) 555-0142","email":"PATEL@gcd.example","city":"Naples","zip":"34102","service":"recurring","property":"commercial","notes":"4,200 sqft","source_detail":"Meta ad"}]')$q$, pg_temp.hash(k_meta)))::jsonb;
  perform pg_temp.prueba('potencial: conteo creados / juntados / rechazados', '1|0|0',
    (r->>'created') || '|' || (r->>'merged') || '|' || (r->>'rejected'));
  select id into lead from leads where email = 'patel@gcd.example';
  insert into ids values ('patel', lead, null);
  perform pg_temp.prueba('potencial: estado Interesado, potential, origen ads, fuente y detalle', 'interested|potential|ads|Meta (Facebook + Instagram)|Meta ad',
    (select l.status || '|' || l.temperature || '|' || l.source || '|' || s.name || '|' || l.source_detail
       from leads l join lead_sources s on s.id = l.source_id where l.id = lead));
  perform pg_temp.prueba('sin HTML, teléfono D-216, correo en minúsculas', 'Gulf Coast Dental|(239) 555-0142|patel@gcd.example',
    (select company || '|' || phone || '|' || email from leads where id = lead));
  perform pg_temp.prueba('sitio del lead con ciudad, FL y ZIP', 'Naples|FL|34102',
    (select city || '|' || state || '|' || zip from lead_sites where lead_id = lead));
  perform pg_temp.prueba('historial: Lead creado con la fuente', 'Meta (Facebook + Instagram)|potential',
    (select detail->>'source_name' || '|' || (detail->>'temperature') from change_log where entity_id = lead and action = 'lead_creado'));
  perform pg_temp.prueba('aviso al momento a quien ve leads (no a quien no)', '1|0|1',
    (select count(*)::text from notifications where kind = 'lead_potential' and profile_id = (select profile_id from actores where nombre = 'ver')) || '|' ||
    (select count(*)::text from notifications where kind = 'lead_potential' and profile_id = (select profile_id from actores where nombre = 'sin')) || '|' ||
    (select count(*)::text from notifications where kind = 'lead_potential' and profile_id = (select profile_id from actores where nombre = 'super')));
  perform pg_temp.prueba('texto del aviso potencial (en)', 'New potential lead · Meta (Facebook + Instagram) · Meta ad|Gulf Coast Dental',
    (select t.title || '|' || t.detail from notifications n, notification_text(n.kind, n.data, 'en') t
      where n.kind = 'lead_potential' and n.profile_id = (select profile_id from actores where nombre = 'ver')));
  perform pg_temp.prueba('chip de la fuente (source_label)', 'Meta ad', pg_temp.valor('ver', format('select source_label(l) from leads l where id = %L', lead)));

  -- Duplicado por teléfono: se junta
  r := pg_temp.valor('servicio', format($q$select lead_intake(%L, '[{"full":"x","contact_name":"Front desk","phone":"239.555.0142","notes":"Second form"}]')$q$, pg_temp.hash(k_meta)))::jsonb;
  perform pg_temp.prueba('duplicado por teléfono: juntado, sin lead nuevo', '0|1|1',
    (r->>'created') || '|' || (r->>'merged') || '|' || (select count(*)::text from leads where phone = '(239) 555-0142'));
  perform pg_temp.prueba('juntado: nota con la fuente y la fecha', 'true',
    (select (notes ~ ('\[' || to_char(now() at time zone cc_tz(), 'YYYY-MM-DD') || ' [0-9:]{5}\] Also came in from Meta \(Facebook \+ Instagram\)') and notes like '%Second form%')::text from leads where id = lead));
  perform pg_temp.prueba('juntado: queda en el historial', '1', (select count(*)::text from change_log where entity_id = lead and action = 'lead_juntado'));
  r := pg_temp.valor('servicio', format($q$select lead_intake(%L, '[{"contact_name":"Dr P","email":" patel@GCD.example "}]')$q$, pg_temp.hash(k_meta)))::jsonb;
  perform pg_temp.prueba('duplicado por correo: juntado', '0|1', (r->>'created') || '|' || (r->>'merged'));

  -- Fríos (Muse): Nuevo, un solo aviso por lote; rechazados sin contacto
  r := pg_temp.valor('servicio', format($q$select lead_intake(%L, '[
      {"company":"Estero Fitness Club","contact_name":"Front desk","email":"info@efc.example"},
      {"company":"Naples Law","phone":"2395550101"},
      {"contact_name":"Maria Gonzalez","phone":"(239) 555-0199","property":"residential","service":"recurring"},
      {"company":"Sin contacto LLC","phone":"123"},
      {"email":"solo@correo.example"}]')$q$, pg_temp.hash(k_muse)))::jsonb;
  perform pg_temp.prueba('lote frío: 3 creados, 2 rechazados con motivo', '3|0|2|contact_missing,name_missing',
    (r->>'created') || '|' || (r->>'merged') || '|' || (r->>'rejected') || '|'
    || (select string_agg(e->>'reason', ',' order by (e->>'index')::int) from jsonb_array_elements(r->'errors') e));
  perform pg_temp.prueba('fríos en Nuevo, cold, origen agent', 'new:cold:agent:3',
    (select min(status::text) || ':' || min(temperature) || ':' || min(source::text) || ':' || count(*) from leads where source_id = (select id from lead_sources where name = 'Muse')));
  perform pg_temp.prueba('residencial entra como one-time sin empresa', 'one_time|residential|',
    (select service || '|' || cleaning_type || '|' || coalesce(company, '') from leads where contact_name = 'Maria Gonzalez'));
  perform pg_temp.prueba('lote frío: un solo aviso por persona', '1',
    (select count(*)::text from notifications where kind = 'leads_cold_batch' and profile_id = (select profile_id from actores where nombre = 'ver')));
  perform pg_temp.prueba('texto del aviso del lote (en / es)', 'Muse added 3 cold leads|Muse agregó 3 leads en frío',
    (select t.title from notifications n, notification_text(n.kind, n.data, 'en') t where n.kind = 'leads_cold_batch' and n.profile_id = (select profile_id from actores where nombre = 'ver'))
    || '|' || (select t.title from notifications n, notification_text(n.kind, n.data, 'es') t where n.kind = 'leads_cold_batch' and n.profile_id = (select profile_id from actores where nombre = 'ver')));
  perform pg_temp.prueba('los fríos no avisan uno por uno', '0',
    (select count(*)::text from notifications where kind = 'lead_potential' and data->>'source' like 'Muse%'));
  perform pg_temp.prueba('conteo de la fuente (creados + juntados)', '3|3',
    (select lead_count::text from lead_sources where name = 'Muse') || '|' || (select lead_count::text from lead_sources where name = 'Meta (Facebook + Instagram)'));

  -- Límite por clave (D-200): 60 peticiones por hora
  insert into lead_intake_log (source_id, received, created, merged, rejected)
  select id, 1, 1, 0, 0 from lead_sources, generate_series(1, 60) where name = 'Muse';
  perform pg_temp.prueba('límite por clave: rate_limited', 'rate_limited',
    pg_temp.valor('servicio', format($q$select lead_intake(%L, '[{"contact_name":"A","email":"lim@b.co"}]')->>'status'$q$, pg_temp.hash(k_muse))));

  -- Reglas del lead (D-349, D-350)
  perform pg_temp.prueba('manual comercial sin empresa: no', 'ERR:23514',
    pg_temp.valor('editor', $q$insert into leads (company, contact_name, source) values ('  ', 'Ana', 'manual') returning id$q$));
  perform pg_temp.prueba('manual residencial one-time sin empresa: sí', 'ok',
    case when pg_temp.valor('editor', $q$insert into leads (contact_name, source, service, cleaning_type) values ('Ana Res', 'manual', 'one_time', 'residential') returning id$q$) like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('residencial recurrente: no', 'ERR:23514',
    pg_temp.valor('editor', $q$insert into leads (company, source, service, cleaning_type) values ('Casa', 'manual', 'recurring', 'residential') returning id$q$));
  perform pg_temp.prueba('website sin empresa sigue permitido (D-319) y entra potential', 'potential',
    pg_temp.valor('editor', $q$insert into leads (contact_name, source) values ('Web Sin', 'web') returning temperature$q$));
  perform pg_temp.prueba('manual entra cold por defecto', 'cold',
    pg_temp.valor('editor', $q$insert into leads (company, source) values ('Manual SA', 'manual') returning temperature$q$));
  perform pg_temp.prueba('un lead anterior sin empresa se puede cambiar de estado', 'ok',
    case when pg_temp.valor('editor', format($q$update leads set status = 'waiting' where contact_name = 'Ana Res' returning id$q$)) like 'ERR%' then 'fallo' else 'ok' end);

  -- Inicio
  perform pg_temp.prueba('Inicio: potenciales nuevos por llamar', '1', pg_temp.valor('ver', 'select home_leads_potential()'));
  perform pg_temp.prueba('Inicio: sin leads_ver no', 'ERR:42501', pg_temp.valor('sin', 'select home_leads_potential()'));
end $$;

select n, prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
