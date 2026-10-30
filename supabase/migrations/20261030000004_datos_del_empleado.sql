-- Orden 49 (D-264, D-267): datos del empleado. Nombre, Apellidos, Teléfono (ya existía), Email, Dirección, Dirección 2,
-- State, City y ZIP code. full_name se sigue usando en toda la app: se arma de Nombre + Apellidos al guardar cuando los
-- dos están llenos (disparador). Los perfiles existentes quedan sin Nombre ni Apellidos (D-267 (2): no se separan solos).

alter table profiles
  add column first_name text check (first_name is null or length(first_name) <= 60),
  add column last_name text check (last_name is null or length(last_name) <= 60),
  add column address_line1 text check (address_line1 is null or length(address_line1) <= 120),
  add column address_line2 text check (address_line2 is null or length(address_line2) <= 120),
  add column state text check (state is null or state in (
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI',
    'MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY')),
  add column city text check (city is null or length(city) <= 80),
  add column zip text check (zip is null or zip ~ '^[0-9]{5}(-[0-9]{4})?$');

-- full_name = Nombre + Apellidos cuando los dos están llenos; si no, se deja como está.
create function profile_full_name() returns trigger
language plpgsql set search_path = public as $$
begin
  if nullif(btrim(coalesce(new.first_name, '')), '') is not null and nullif(btrim(coalesce(new.last_name, '')), '') is not null then
    new.full_name := btrim(new.first_name) || ' ' || btrim(new.last_name);
  end if;
  return new;
end $$;
create trigger profiles_full_name before insert or update of first_name, last_name, full_name on profiles
  for each row execute function profile_full_name();
revoke execute on function profile_full_name() from public, anon, authenticated;

-- Historial: el disparador de perfiles cubre también los campos nuevos.
create or replace function log_profile_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  antes jsonb;
  despues jsonb;
begin
  if tg_op = 'INSERT' then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'perfil_creado', 'profiles', new.id,
            jsonb_build_object('role', new.role, 'worker_type', new.worker_type,
                               'has_app_access', new.has_app_access));
    return new;
  end if;

  antes := jsonb_build_object('full_name', old.full_name, 'phone', old.phone, 'email', old.email,
    'role', old.role, 'worker_type', old.worker_type, 'active', old.active,
    'is_super_admin', old.is_super_admin, 'has_app_access', old.has_app_access,
    'language', old.language, 'first_login_at', old.first_login_at,
    'first_name', old.first_name, 'last_name', old.last_name, 'address_line1', old.address_line1,
    'address_line2', old.address_line2, 'state', old.state, 'city', old.city, 'zip', old.zip);
  despues := jsonb_build_object('full_name', new.full_name, 'phone', new.phone, 'email', new.email,
    'role', new.role, 'worker_type', new.worker_type, 'active', new.active,
    'is_super_admin', new.is_super_admin, 'has_app_access', new.has_app_access,
    'language', new.language, 'first_login_at', new.first_login_at,
    'first_name', new.first_name, 'last_name', new.last_name, 'address_line1', new.address_line1,
    'address_line2', new.address_line2, 'state', new.state, 'city', new.city, 'zip', new.zip);
  if antes is distinct from despues then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'perfil_cambiado', 'profiles', new.id,
            jsonb_build_object('antes', antes, 'despues', despues));
  end if;
  return new;
end $$;

-- Crear empleado: Nombre y Apellidos obligatorios (D-267 (3)); el correo sigue obligatorio con acceso a la app.
-- Reemplaza a create_employee(text, ...): la Edge Function create-employee se despliega junto con esta migración.
drop function create_employee(text, text, worker_type, role_template, app_language, boolean, text);
create function create_employee(
  p_first_name text, p_last_name text, p_phone text, p_worker_type worker_type, p_role role_template,
  p_language app_language, p_has_app_access boolean, p_email text,
  p_address_line1 text default null, p_address_line2 text default null, p_state text default null,
  p_city text default null, p_zip text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  clean_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if not has_permission('empleados_invitar_crear') then
    raise exception 'No tienes permiso para crear empleados' using errcode = '42501';
  end if;
  if btrim(coalesce(p_first_name, '')) = '' or btrim(coalesce(p_last_name, '')) = '' then
    raise exception 'Nombre y Apellidos son obligatorios' using errcode = '22023';
  end if;
  if p_worker_type is null then
    raise exception 'El tipo de trabajador es obligatorio' using errcode = '22023';
  end if;
  if p_has_app_access and clean_email is null then
    raise exception 'El correo es obligatorio con acceso a la app' using errcode = '22023';
  end if;

  begin
    insert into profiles (first_name, last_name, full_name, phone, worker_type, role, language, has_app_access, email,
                          address_line1, address_line2, state, city, zip)
    values (btrim(p_first_name), btrim(p_last_name), btrim(p_first_name) || ' ' || btrim(p_last_name),
            nullif(btrim(coalesce(p_phone, '')), ''), p_worker_type, p_role, p_language, p_has_app_access, clean_email,
            nullif(btrim(coalesce(p_address_line1, '')), ''), nullif(btrim(coalesce(p_address_line2, '')), ''),
            nullif(upper(btrim(coalesce(p_state, ''))), ''), nullif(btrim(coalesce(p_city, '')), ''),
            nullif(btrim(coalesce(p_zip, '')), ''))
    returning id into new_id;
  exception when check_violation then
    raise exception 'Datos no válidos' using errcode = '22023';
  end;

  insert into profile_permissions (profile_id, permission_key, granted_by)
  select new_id, k, current_profile_id() from unnest(role_template_permissions(p_role)) k where has_permission(k);

  return new_id;
end $$;

-- Editar datos: Nombre y Apellidos obligatorios; dirección opcional. La versión anterior (p_full_name) se deja para
-- las apps ya instaladas hasta que se actualicen; si el perfil ya tiene Nombre y Apellidos, full_name sigue saliendo
-- de ellos.
create function update_employee(
  p_profile uuid, p_first_name text, p_last_name text, p_phone text, p_worker_type worker_type, p_language app_language,
  p_address_line1 text default null, p_address_line2 text default null, p_state text default null,
  p_city text default null, p_zip text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target profiles;
begin
  if not has_permission('empleados_editar_desactivar') then
    raise exception 'No tienes permiso para editar empleados' using errcode = '42501';
  end if;
  select * into target from profiles where id = p_profile;
  if not found then
    raise exception 'Empleado no encontrado' using errcode = 'P0002';
  end if;
  if target.is_super_admin and not is_super_admin() then
    raise exception 'Solo el Super Admin edita al Super Admin' using errcode = '42501';
  end if;
  if btrim(coalesce(p_first_name, '')) = '' or btrim(coalesce(p_last_name, '')) = '' then
    raise exception 'Nombre y Apellidos son obligatorios' using errcode = '22023';
  end if;
  if p_worker_type is null and not target.is_super_admin then
    raise exception 'El tipo de trabajador es obligatorio' using errcode = '22023';
  end if;
  begin
    update profiles
       set first_name = btrim(p_first_name),
           last_name = btrim(p_last_name),
           phone = nullif(btrim(coalesce(p_phone, '')), ''),
           worker_type = p_worker_type,
           language = p_language,
           address_line1 = nullif(btrim(coalesce(p_address_line1, '')), ''),
           address_line2 = nullif(btrim(coalesce(p_address_line2, '')), ''),
           state = nullif(upper(btrim(coalesce(p_state, ''))), ''),
           city = nullif(btrim(coalesce(p_city, '')), ''),
           zip = nullif(btrim(coalesce(p_zip, '')), '')
     where id = p_profile;
  exception when check_violation then
    raise exception 'Datos no válidos' using errcode = '22023';
  end;
end $$;

revoke execute on function
  create_employee(text, text, text, worker_type, role_template, app_language, boolean, text, text, text, text, text, text),
  update_employee(uuid, text, text, text, worker_type, app_language, text, text, text, text, text) from public, anon;
grant execute on function
  create_employee(text, text, text, worker_type, role_template, app_language, boolean, text, text, text, text, text, text),
  update_employee(uuid, text, text, text, worker_type, app_language, text, text, text, text, text) to authenticated;
