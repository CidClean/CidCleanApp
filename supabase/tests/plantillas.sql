-- Pruebas de la orden 120 (migración 20261118000001, D-321 a D-323): tabla email_templates, RLS (leen las activas
-- quienes ven leads o clientes; solo el Super Admin crea, edita y borra), siembra exacta, historial, contexto para
-- llenar la plantilla y log_template_email. Repetibles: terminan en rollback.
-- Uso: psql -f supabase/tests/plantillas.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
grant all on resultados, actores to public;

-- Ejecuta una consulta como una persona autenticada (o anon) y devuelve el primer valor como texto,
-- o 'ERR:' y el código de error si falla.
create function pg_temp.valor(quien text, consulta text) returns text language plpgsql as $$
declare
  resultado text;
  uid uuid;
begin
  if quien = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    select auth_id into uid from actores where nombre = quien;
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
  end if;
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate;
  end;
  reset role;
  return resultado;
end $$;

-- Ejecuta como la service role (dueño de las funciones) y devuelve el valor o 'ERR:' y el código.
create function pg_temp.directo(consulta text) returns text language plpgsql as $$
declare resultado text;
begin
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate;
  end;
  return resultado;
end $$;

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

do $$
declare quien text; pid uuid; aid uuid;
begin
  foreach quien in array array['ventas', 'cuentas', 'nadie'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access, phone)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-pc.local', true, '2395550101') returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-pc.local');
    update profiles set auth_user_id = aid where id = pid;
    insert into actores values (quien, aid, pid);
  end loop;
  -- El Super Admin sembrado (D-144), con un usuario de Auth de prueba si no lo tiene.
  aid := gen_random_uuid();
  if exists (select 1 from profiles where is_super_admin and auth_user_id is null) then
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-pc.local');
    update profiles set auth_user_id = aid where is_super_admin;
  end if;
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
  insert into profile_permissions (profile_id, permission_key) select profile_id, 'leads_ver' from actores where nombre = 'ventas';
  insert into profile_permissions (profile_id, permission_key) select profile_id, 'clientes_ver' from actores where nombre = 'cuentas';
end $$;

-- 1. Siembra (D-322, D-323) ----------------------------------------------------------------------------------------
select pg_temp.prueba('tres plantillas de prospectos, en orden', 'Primer contacto|Seguimiento|Seguimiento final',
  (select string_agg(name, '|' order by sort) from email_templates where audience = 'prospect'));
select pg_temp.prueba('clientes sin plantillas', '0', (select count(*)::text from email_templates where audience = 'client'));
select pg_temp.prueba('asuntos exactos', 'Commercial cleaning for {empresa}|Re: Commercial cleaning for {empresa}|Closing the loop',
  (select string_agg(subject, '|' order by sort) from email_templates where audience = 'prospect'));
select pg_temp.prueba('texto exacto de Primer contacto', 'Hi {nombre},' || chr(10) || chr(10) || 'I''m reaching out from Cid Clean, a commercial cleaning company here in Naples. We clean offices, medical offices, showrooms and warehouses on the schedule that suits each business, usually after hours.' || chr(10) || chr(10) || 'If you''d like, I can visit {dirección} for a free 30-minute walkthrough and send you an exact quote. Would that be useful?' || chr(10) || chr(10) || '{firma}',
  (select body from email_templates where name = 'Primer contacto'));
select pg_temp.prueba('Seguimiento final termina con Thanks y {firma}', '1',
  (select (body like '%Thanks for your time,' || chr(10) || chr(10) || '{firma}')::int::text from email_templates where name = 'Seguimiento final'));
select pg_temp.prueba('la siembra no deja historial', '0', (select count(*)::text from change_log where entity = 'email_templates'));

-- 2. RLS ----------------------------------------------------------------------------------------------------------
select pg_temp.prueba('ventas lee las de prospectos', '3', pg_temp.valor('ventas', 'select count(*) from email_templates'));
select pg_temp.prueba('nadie (sin permisos) no lee', '0', pg_temp.valor('nadie', 'select count(*) from email_templates'));
select pg_temp.prueba('anon no lee', 'ERR:42501', pg_temp.valor('anon', 'select count(*) from email_templates'));
select pg_temp.prueba('ventas no crea', 'ERR:42501', pg_temp.valor('ventas', $q$insert into email_templates (name, audience, subject, body) values ('X', 'prospect', 'S', 'B') returning id$q$));
select pg_temp.prueba('ventas no edita (0 filas)', null, pg_temp.valor('ventas', $q$update email_templates set name = 'X' returning id$q$));
select pg_temp.prueba('ventas no borra (0 filas)', null, pg_temp.valor('ventas', $q$delete from email_templates returning id$q$));
select pg_temp.prueba('el Super Admin crea una de clientes', 'ok', case when pg_temp.valor('super', $q$insert into email_templates (name, audience, subject, body, sort) values ('Aviso', 'client', 'Hello {empresa}', 'Hi {nombre},' || chr(10) || '{firma}', 1) returning id$q$) like 'ERR%' then 'fallo' else 'ok' end);
select pg_temp.prueba('creada y actualizada por los pone la base', 'super|super',
  (select case when t.created_by = a.profile_id then 'super' end || '|' || case when t.updated_by = a.profile_id then 'super' end
     from email_templates t, actores a where t.name = 'Aviso' and a.nombre = 'super'));
select pg_temp.prueba('cuentas lee la de clientes, no las de prospectos', '1', pg_temp.valor('cuentas', 'select count(*) from email_templates'));
select pg_temp.prueba('ventas no ve las de clientes', '0', pg_temp.valor('ventas', $q$select count(*) from email_templates where audience = 'client'$q$));
select pg_temp.prueba('el Super Admin desactiva', 'Seguimiento final', pg_temp.valor('super', $q$update email_templates set active = false where name = 'Seguimiento final' returning name$q$));
select pg_temp.prueba('una inactiva no sale a ventas', '2', pg_temp.valor('ventas', 'select count(*) from email_templates'));
select pg_temp.prueba('el Super Admin sí la ve', '4', pg_temp.valor('super', 'select count(*) from email_templates'));
select pg_temp.prueba('audiencia no válida', 'ERR:23514', pg_temp.valor('super', $q$insert into email_templates (name, audience, subject, body) values ('X', 'otro', 'S', 'B') returning id$q$));
select pg_temp.prueba('asunto vacío no', 'ERR:23514', pg_temp.valor('super', $q$insert into email_templates (name, audience, subject, body) values ('X', 'client', ' ', 'B') returning id$q$));
select pg_temp.prueba('el Super Admin borra', 'Aviso', pg_temp.valor('super', $q$delete from email_templates where name = 'Aviso' returning name$q$));
select pg_temp.prueba('historial: creada, editada y eliminada', 'plantilla_creada|plantilla_editada|plantilla_eliminada',
  (select string_agg(action, '|' order by id) from change_log where entity = 'email_templates'));
select pg_temp.prueba('el historial general lleva el nombre', 'Aviso',
  (select change_log_safe_detail(detail)->>'plantilla' from change_log where entity = 'email_templates' order by id limit 1));

-- 3. Contexto y registro del envío ------------------------------------------------------------------------------
do $$
declare l uuid; c uuid; t uuid; tc uuid; r jsonb;
begin
  insert into leads (company, contact_name, email, source) values ('Superior Pool Products', 'Armando Zerquera', 'Armando@PoolCorp.com', 'manual') returning id into l;
  insert into lead_sites (lead_id, address_line1, city, state, zip) values (l, '280 Commercial Blvd', 'Naples', 'FL', '34110');
  insert into clients (name, email) values ('Cliente PC', 'pagos@cliente-pc.local') returning id into c;
  insert into jobsites (client_id, name, address, contact_name, contact_email) values (c, 'Oficina', '1 Main St, Naples, FL 34102', 'Rosa Pérez', 'rosa@cliente-pc.local');
  insert into email_templates (name, audience, subject, body) values ('Cliente', 'client', 'S', 'B') returning id into tc;
  select id into t from email_templates where name = 'Primer contacto';
  r := pg_temp.valor('ventas', format('select template_email_context(%L, %L)', 'lead', l))::jsonb;
  perform pg_temp.prueba('contexto del lead: empresa, dirección, contacto y firma',
    'Superior Pool Products|280 Commercial Blvd|Armando Zerquera|armando@poolcorp.com|Prueba ventas|(239) 555-0101',
    concat_ws('|', r->>'company', r->>'address', r->'contacts'->0->>'name', r->'contacts'->0->>'email', r->'sender'->>'name', r->'sender'->>'phone'));
  perform pg_temp.prueba('contexto del lead sin leads_ver', 'ERR:42501', pg_temp.valor('cuentas', format('select template_email_context(%L, %L)', 'lead', l)));
  r := pg_temp.valor('cuentas', format('select template_email_context(%L, %L)', 'client', c))::jsonb;
  perform pg_temp.prueba('contexto del cliente: correo del cliente y contacto del jobsite', '2|pagos@cliente-pc.local|Rosa Pérez',
    concat_ws('|', jsonb_array_length(r->'contacts'), r->'contacts'->0->>'email', r->'contacts'->1->>'name'));
  perform pg_temp.prueba('registrar con plantilla de prospecto en lead', 'ok',
    case when pg_temp.valor('ventas', format('select log_template_email(%L, %L, %L, %L)', t, 'lead', l, 'open')) ~ '^[0-9]+$' then 'ok' else 'fallo' end);
  perform pg_temp.prueba('queda en el historial del lead con plantilla y quién', 'correo_plantilla|Primer contacto|open|Prueba ventas',
    (select concat_ws('|', g.action, g.detail->>'plantilla', g.detail->>'kind', p.full_name) from change_log g join profiles p on p.id = g.actor_id
      where g.entity = 'leads' and g.entity_id = l and g.action = 'correo_plantilla'));
  perform pg_temp.prueba('plantilla de clientes en un lead no', 'ERR:22023', pg_temp.valor('super', format('select log_template_email(%L, %L, %L, %L)', tc, 'lead', l, 'copy')));
  perform pg_temp.prueba('sin permiso de clientes no registra en cliente', 'ERR:42501', pg_temp.valor('ventas', format('select log_template_email(%L, %L, %L, %L)', tc, 'client', c, 'copy')));
  perform pg_temp.prueba('acción no válida', 'ERR:22023', pg_temp.valor('ventas', format('select log_template_email(%L, %L, %L, %L)', t, 'lead', l, 'send')));
  perform pg_temp.prueba('cuentas registra Copiar texto en cliente', 'ok',
    case when pg_temp.valor('cuentas', format('select log_template_email(%L, %L, %L, %L)', tc, 'client', c, 'copy')) ~ '^[0-9]+$' then 'ok' else 'fallo' end);
  update email_templates set active = false where id = t;
  perform pg_temp.prueba('plantilla inactiva no registra', 'ERR:P0002', pg_temp.valor('ventas', format('select log_template_email(%L, %L, %L, %L)', t, 'lead', l, 'open')));
  perform pg_temp.prueba('línea de tiempo del lead', 'Primer contacto|Prueba ventas', pg_temp.valor('ventas', format('select template || %L || actor from entity_email_log(%L, %L)', '|', 'lead', l)));
  perform pg_temp.prueba('línea de tiempo del cliente sin permiso', 'ERR:42501', pg_temp.valor('ventas', format('select count(*) from entity_email_log(%L, %L)', 'client', c)));
  perform pg_temp.prueba('anon no registra', 'ERR:42501', pg_temp.valor('anon', format('select log_template_email(%L, %L, %L, %L)', tc, 'client', c, 'copy')));
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
