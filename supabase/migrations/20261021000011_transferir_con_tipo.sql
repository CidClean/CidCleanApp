-- Orden 13: D-206 (tipo de trabajador al transferir el rol de Super Admin) y nombres del historial para sitios y motivos.

-- Transferir con tipo de trabajador opcional: si quien transfiere no tiene tipo, lo elige en la pantalla y se guarda
-- en la misma transacción (D-206). Reemplaza a la versión de un solo parámetro.
drop function transfer_super_admin(uuid);

create function transfer_super_admin(p_new uuid, p_worker_type worker_type default null) returns void
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
  -- Si no lo tiene, se elige en la pantalla y se guarda aquí, en la misma transacción (D-206).
  if me.worker_type is null and p_worker_type is null then
    raise exception 'Falta el tipo de trabajador de quien transfiere' using errcode = '23514';
  end if;

  -- Primero se quita al anterior: el índice permite un solo Super Admin.
  update profiles set is_super_admin = false, role = 'admin', worker_type = coalesce(me.worker_type, p_worker_type)
   where id = me.id;
  update profiles set is_super_admin = true where id = target.id;
  insert into profile_permissions (profile_id, permission_key, granted_by)
  select me.id, p.key, me.id from permissions p
  on conflict do nothing;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me.id, 'super_admin_transferido', 'profiles', target.id, jsonb_build_object('anterior', me.id));
end $$;

-- Historial: leads por su empresa (company), sitios por su nombre; motivos sin sujeto (la app usa la etiqueta en su idioma).
create or replace function change_log_subject(p_entity text, p_entity_id uuid, p_detail jsonb) returns text
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
  elsif p_entity = 'lost_reasons' then
    return null; -- el motivo va en su idioma desde el detalle (label_es / label_en)
  elsif p_entity = 'lead_sites' then
    return coalesce((select s.name from lead_sites s where s.id = p_entity_id), p_detail->'despues'->>'name', p_detail->>'name', p_detail->>'company');
  end if;
  -- Otras tablas (p. ej. leads, walkthroughs): por su fila si existe; si no, por el nombre guardado en el detalle.
  if p_entity_id is not null and p_entity ~ '^[a-z_]+$' and to_regclass('public.' || p_entity) is not null then
    begin
      execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_entity) into row_json using p_entity_id;
    exception when others then
      row_json := null;
    end;
  end if;
  foreach k in array array['company', 'company_name', 'business_name', 'name', 'full_name', 'title'] loop
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
    foreach k in array array['company', 'company_name', 'business_name', 'name', 'full_name', 'title'] loop
      name := row_json->>k;
      if name is not null and btrim(name) <> '' then return name; end if;
    end loop;
  end if;
  return null;
end $$;

-- Detalle seguro: también la etiqueta del motivo (no es sensible).
create or replace function change_log_safe_detail(p_detail jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'permiso', p_detail->>'permiso',
    'kind', p_detail->>'kind',
    'version', p_detail->'version',
    'label_es', coalesce(p_detail->>'label_es', p_detail->'despues'->>'label_es'),
    'label_en', coalesce(p_detail->>'label_en', p_detail->'despues'->>'label_en'),
    'antes', case when jsonb_typeof(p_detail->'antes') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'role', p_detail->'antes'->'role', 'worker_type', p_detail->'antes'->'worker_type', 'active', p_detail->'antes'->'active',
      'is_super_admin', p_detail->'antes'->'is_super_admin', 'has_app_access', p_detail->'antes'->'has_app_access')) end,
    'despues', case when jsonb_typeof(p_detail->'despues') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'role', p_detail->'despues'->'role', 'worker_type', p_detail->'despues'->'worker_type', 'active', p_detail->'despues'->'active',
      'is_super_admin', p_detail->'despues'->'is_super_admin', 'has_app_access', p_detail->'despues'->'has_app_access')) end
  ))
$$;

revoke execute on function change_log_subject(text, uuid, jsonb), change_log_safe_detail(jsonb) from public, anon, authenticated;
revoke execute on function transfer_super_admin(uuid, worker_type) from public, anon;
grant  execute on function transfer_super_admin(uuid, worker_type) to authenticated;
