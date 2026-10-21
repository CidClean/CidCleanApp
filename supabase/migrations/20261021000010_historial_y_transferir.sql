-- Orden 12: Historial de cambios (D-088, D-198) y transferir el rol de Super Admin (D-090, D-116, D-199).

-- A. Historial ---------------------------------------------------------------------------------------------
-- Nombre de "a quién o qué" de una fila: perfiles por su nombre; leads y walkthroughs (hito 2) por el nombre que
-- tengan, si la tabla existe. Nunca devuelve montos ni rutas de archivos.
create function change_log_subject(p_entity text, p_entity_id uuid, p_detail jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  row_json jsonb;
  name text;
  k text;
begin
  if p_entity in ('profiles', 'profile_permissions') then
    return (select full_name from profiles where id = p_entity_id);
  elsif p_entity = 'profile_documents' then
    return (select full_name from profiles where id = nullif(p_detail->>'profile_id', '')::uuid);
  elsif p_entity = 'terms_documents' then
    return p_detail->>'kind';
  end if;
  -- Otras tablas (p. ej. leads, walkthroughs): por su fila si existe; si no, por el nombre guardado en el detalle.
  if p_entity_id is not null and p_entity ~ '^[a-z_]+$' and to_regclass('public.' || p_entity) is not null then
    begin
      execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_entity) into row_json using p_entity_id;
    exception when others then
      row_json := null;
    end;
  end if;
  foreach k in array array['company_name', 'business_name', 'name', 'full_name', 'title'] loop
    name := coalesce(row_json->>k, p_detail->>k);
    if name is not null and btrim(name) <> '' then return name; end if;
  end loop;
  -- Walkthrough y otros que cuelgan de un lead.
  if coalesce(row_json->>'lead_id', p_detail->>'lead_id') is not null and to_regclass('public.leads') is not null then
    begin
      execute 'select to_jsonb(l) from public.leads l where l.id = $1' into row_json
        using coalesce(row_json->>'lead_id', p_detail->>'lead_id')::uuid;
    exception when others then
      row_json := null;
    end;
    foreach k in array array['company_name', 'business_name', 'name', 'full_name', 'title'] loop
      name := row_json->>k;
      if name is not null and btrim(name) <> '' then return name; end if;
    end loop;
  end if;
  return null;
end $$;

-- Solo los datos del detalle que sirven para el título; nada de montos ni archivos.
create function change_log_safe_detail(p_detail jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'permiso', p_detail->>'permiso',
    'kind', p_detail->>'kind',
    'version', p_detail->'version',
    'antes', case when jsonb_typeof(p_detail->'antes') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'role', p_detail->'antes'->'role', 'worker_type', p_detail->'antes'->'worker_type', 'active', p_detail->'antes'->'active',
      'is_super_admin', p_detail->'antes'->'is_super_admin', 'has_app_access', p_detail->'antes'->'has_app_access')) end,
    'despues', case when jsonb_typeof(p_detail->'despues') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'role', p_detail->'despues'->'role', 'worker_type', p_detail->'despues'->'worker_type', 'active', p_detail->'despues'->'active',
      'is_super_admin', p_detail->'despues'->'is_super_admin', 'has_app_access', p_detail->'despues'->'has_app_access')) end
  ))
$$;

-- Página del historial, la más reciente arriba. p_before: id de la última fila ya mostrada (null = primera página).
create function list_change_log(p_before bigint default null, p_limit int default 30)
returns table (id bigint, at timestamptz, action text, subject text, actor text, info jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('historial_ver') then
    raise exception 'No tienes permiso para ver el historial' using errcode = '42501';
  end if;
  return query
    select l.id, l.at, l.action, change_log_subject(l.entity, l.entity_id, l.detail), a.full_name,
           change_log_safe_detail(l.detail)
      from change_log l
      left join profiles a on a.id = l.actor_id
     where p_before is null or l.id < p_before
     order by l.id desc
     limit least(greatest(coalesce(p_limit, 30), 1), 100);
end $$;

-- B. Transferir el rol de Super Admin ------------------------------------------------------------------
-- Atómica: el nuevo pasa a Super Admin; quien transfiere queda con rol Admin y los 36 permisos delegables,
-- incluido Gestionar permisos, y deja de ser Super Admin (D-199). Solo a un perfil activo, con acceso a la app,
-- que ya entró al menos una vez, y nunca a uno mismo. Queda en change_log (además de lo que escriben los disparadores).
create function transfer_super_admin(p_new uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  target profiles;
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin transfiere el rol' using errcode = '42501';
  end if;
  select * into me from profiles where id = current_profile_id() for update;
  if p_new = me.id then
    raise exception 'No puedes transferirte el rol a ti mismo' using errcode = '22023';
  end if;
  select * into target from profiles where id = p_new for update;
  if not found then
    raise exception 'Empleado no encontrado' using errcode = 'P0002';
  end if;
  if not target.active or not target.has_app_access or target.auth_user_id is null or target.first_login_at is null then
    raise exception 'Solo a un empleado activo, con acceso a la app y que ya entró' using errcode = '22023';
  end if;
  -- Quien deja de ser Super Admin debe tener tipo de trabajador (regla de profiles: solo el Super Admin va sin tipo).
  if me.worker_type is null then
    raise exception 'Falta el tipo de trabajador de quien transfiere' using errcode = '23514';
  end if;

  -- Primero se quita al anterior: el índice permite un solo Super Admin.
  update profiles set is_super_admin = false, role = 'admin' where id = me.id;
  update profiles set is_super_admin = true where id = target.id;
  insert into profile_permissions (profile_id, permission_key, granted_by)
  select me.id, p.key, me.id from permissions p
  on conflict do nothing;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me.id, 'super_admin_transferido', 'profiles', target.id, jsonb_build_object('anterior', me.id));
end $$;

-- Quién puede recibir el rol (para el selector): activos, con acceso a la app, que ya entraron, menos uno mismo.
create function super_admin_candidates() returns table (id uuid, full_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin transfiere el rol' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name from profiles p
     where p.active and p.has_app_access and p.auth_user_id is not null and p.first_login_at is not null
       and not p.is_super_admin
     order by p.full_name;
end $$;

revoke execute on function change_log_subject(text, uuid, jsonb), change_log_safe_detail(jsonb) from public, anon, authenticated;
revoke execute on function list_change_log(bigint, int), transfer_super_admin(uuid), super_admin_candidates() from public, anon;
grant  execute on function list_change_log(bigint, int), transfer_super_admin(uuid), super_admin_candidates() to authenticated;
