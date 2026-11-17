-- Pruebas de la orden 115 (migración 20261117000004, D-317 4, D-320 4): documents_library devuelve solo lo que quien
-- llama ya puede ver. Repetibles: terminan en rollback. Uso: psql -f supabase/tests/documentos.sql

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
  foreach quien in array array['nadie', 'ventas', 'gestor', 'super2', 'contratista'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, case when quien = 'contratista' then '1099' else 'w2' end::worker_type, 'employee', quien || '@prueba-docs.local', true)
    returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-docs.local');
    update profiles set auth_user_id = aid where id = pid;
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, k from actores, unnest(array['quotes_ver', 'quotes_ver_precios']) k where nombre = 'ventas';
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, 'empleados_gestionar_documentos' from actores where nombre = 'gestor';
end $$;

-- Super Admin: el que ya existe en la base de prueba.
do $$
declare pid uuid; aid uuid;
begin
  select id, auth_user_id into pid, aid from profiles where is_super_admin limit 1;
  if aid is null then
    aid := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'superdocs@prueba-docs.local');
    update profiles set auth_user_id = aid where id = pid;
  end if;
  insert into actores values ('super', aid, pid);
end $$;

-- Datos: un quote enviado con PDF y SOW, W-9 y certificado del contratista.
do $$
declare l uuid; s uuid; w uuid := gen_random_uuid(); q uuid; c uuid := (select profile_id from actores where nombre = 'contratista');
begin
  insert into leads (company, contact_name) values ('Docs Prueba LLC', 'Ana') returning id into l;
  insert into lead_sites (lead_id, address) values (l, '1 Main St, Naples, FL 34102') returning id into s;
  insert into walkthroughs (id, site_id, status, current_version, closed_at) values (w, s, 'closed', 1, now());
  insert into walkthrough_versions (walkthrough_id, version, data) values (w, 1, '{"contact":{},"areas":[]}');
  insert into quotes (lead_id, site_id, walkthrough_id) values (l, s, w) returning id into q;
  insert into quote_versions (quote_id, minor, walkthrough_version, status, sent_at, pdf_path, sow_path, snapshot)
  values (q, 0, 1, 'sent', now(), q || '/v/quote-1.0.pdf', q || '/v/sow-v1-0.pdf', '{"company":"Docs Prueba LLC"}');
  insert into profile_documents (profile_id, kind, file_path) values (c, 'w9', c || '/w9/a.pdf'), (c, 'insurance_certificate', c || '/insurance_certificate/a.pdf');
end $$;

create function pg_temp.n(quien text, filtro text, busqueda text default null) returns text language sql as $$
  select pg_temp.valor(quien, format('select count(*)::text from documents_library(%L, %L, 0)', filtro, busqueda))
$$;
create function pg_temp.kinds(quien text) returns text language sql as $$
  select pg_temp.valor(quien, $q$select coalesce(string_agg(distinct doc_kind || ':' || title, ',' order by doc_kind || ':' || title), '') from documents_library('all', 'Docs Prueba', 0) where doc_kind in ('quote','sow')$q$)
$$;

select pg_temp.prueba('sin permisos no ve nada', '0', pg_temp.n('nadie', 'all'));
select pg_temp.prueba('sin permisos tampoco en Personal ni Reportes', '0|0', pg_temp.n('nadie', 'personal') || '|' || pg_temp.n('nadie', 'reports'));
select pg_temp.prueba('con quotes_ver y precios ve el quote, no el SOW (sin permiso de SOW)', 'true|0',
  (pg_temp.kinds('ventas') like 'quote:Quote Q-%')::text || '|' || pg_temp.n('ventas', 'sow'));
select pg_temp.prueba('sin quotes_ver_precios no ve quotes', '0', pg_temp.n('gestor', 'quotes'));
select pg_temp.prueba('el Super Admin ve quote, SOW y walkthrough', '3', pg_temp.n('super', 'all', 'Docs Prueba'));
select pg_temp.prueba('quien gestiona documentos ve el certificado ajeno, no el W-9 ajeno', 'Insurance certificate',
  pg_temp.valor('gestor', $q$select string_agg(title, ',') from documents_library('personal', 'Prueba contratista', 0)$q$));
select pg_temp.prueba('el Super Admin ve el W-9 ajeno', 'true',
  pg_temp.valor('super', $q$select (count(*) filter (where title = 'W-9') = 1)::text from documents_library('personal', 'Prueba contratista', 0)$q$));
select pg_temp.prueba('el contratista ve sus propios documentos (W-9 incluido)', '2', pg_temp.n('contratista', 'personal'));
select pg_temp.prueba('sin ver pagos no ve estados de cuenta', '0', pg_temp.n('gestor', 'reports'));
select pg_temp.prueba('la búsqueda filtra por nombre o cliente', '0', pg_temp.n('super', 'all', 'no-existe-xyz'));
select pg_temp.prueba('los comodines de la búsqueda se tratan como texto', '0', pg_temp.n('super', 'all', '%%%'));
select pg_temp.prueba('filtro no válido (22023)', 'ERR:22023', pg_temp.n('super', 'fotos'));
select pg_temp.prueba('anon no la llama (42501)', 'ERR:42501', pg_temp.valor('anon', 'select count(*)::text from documents_library()'));

select n, prueba, ok, detalle from resultados order by n;
rollback;
