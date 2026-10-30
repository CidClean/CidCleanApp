-- Orden 57 (D-282): Ajustes → Cuenta → "Eliminar cuenta" para todo el personal (no para el Super Admin).
-- La solicitud queda en account_deletion_requests (persona, fecha, estado pendiente/atendida) y en el historial; se
-- avisa al Super Admin en la app y por correo (send-notifications). El Super Admin la marca como atendida: se desactiva
-- la cuenta y su acceso a la app (la sesión se cierra al comprobarla, D-126). El borrado real de los datos lo hará la
-- retención (fase E); lo que la ley obliga a guardar se conserva hasta su plazo.

create table account_deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id),
  requested_at timestamptz not null default now(),
  status       text not null default 'pending' check (status in ('pending', 'done')),
  handled_at   timestamptz,
  handled_by   uuid references profiles(id)
);
-- Una sola solicitud pendiente por persona.
create unique index account_deletion_requests_pending on account_deletion_requests (profile_id) where status = 'pending';

alter table account_deletion_requests enable row level security;
create policy account_deletion_requests_read on account_deletion_requests for select to authenticated
  using (profile_id = current_profile_id() or is_super_admin());
revoke all on account_deletion_requests from anon;
revoke insert, update, delete, truncate, references, trigger on account_deletion_requests from authenticated;

-- Pedir la eliminación de la propia cuenta. Devuelve la fecha de la solicitud (la pendiente si ya había una).
create function request_account_deletion() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  r account_deletion_requests;
begin
  select * into me from profiles where id = current_profile_id();
  if not found or not me.active then
    raise exception 'Sin perfil activo' using errcode = '42501';
  end if;
  if me.is_super_admin then
    raise exception 'El Super Admin no elimina su cuenta desde la app' using errcode = '42501';
  end if;
  select * into r from account_deletion_requests where profile_id = me.id and status = 'pending';
  if found then return r.requested_at; end if;

  insert into account_deletion_requests (profile_id) values (me.id) returning * into r;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me.id, 'cuenta_eliminacion_solicitada', 'profiles', me.id, jsonb_build_object('request_id', r.id));
  begin
    perform notify_profiles(array(select id from profiles where is_super_admin and active), 'account_deletion_requested',
      jsonb_build_object('name', me.full_name), jsonb_build_object('pathname', '/settings/account-deletions'), false,
      'del:' || r.id);
  exception when others then null;
  end;
  return r.requested_at;
end $$;

-- Solicitudes para Ajustes del Super Admin: pendientes primero, después las más recientes.
create function list_account_deletion_requests()
returns table (id uuid, profile_id uuid, full_name text, email text, requested_at timestamptz, status text, handled_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin' using errcode = '42501';
  end if;
  return query
    select r.id, r.profile_id, p.full_name, p.email, r.requested_at, r.status, r.handled_at
      from account_deletion_requests r join profiles p on p.id = r.profile_id
     order by (r.status = 'pending') desc, r.requested_at desc;
end $$;

-- Marcar como atendida: desactiva la cuenta y su acceso a la app, y queda en el historial.
create function complete_account_deletion(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r account_deletion_requests;
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin' using errcode = '42501';
  end if;
  select * into r from account_deletion_requests where id = p_id;
  if not found then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;
  if r.status = 'done' then return; end if;
  update account_deletion_requests set status = 'done', handled_at = now(), handled_by = current_profile_id() where id = p_id;
  update profiles set active = false, has_app_access = false where id = r.profile_id and not is_super_admin;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'cuenta_eliminacion_atendida', 'profiles', r.profile_id, jsonb_build_object('request_id', r.id));
end $$;

revoke execute on function request_account_deletion(), list_account_deletion_requests(), complete_account_deletion(uuid) from public, anon;
grant  execute on function request_account_deletion(), list_account_deletion_requests(), complete_account_deletion(uuid) to authenticated;
