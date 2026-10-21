-- Hito 2b: editar y borrar sitios del lead (D-202) y motivos de lead perdido en Ajustes (D-203).
-- Eliminar un lead (D-201) ya lo permitía 20261022000001 (leads_eliminar) y queda en el historial (lead_eliminado).

-- D-202: sitios ------------------------------------------------------------------------------------

-- Borrar un sitio suelto pide leads_editar y no se permite si el sitio ya tiene un walkthrough hecho.
-- Cuando el sitio se va porque se eliminó su lead (D-201, en cascada), no se bloquea.
create function lead_site_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from leads where id = old.lead_id)
     and exists (select 1 from walkthrough_appointments where site_id = old.id and status = 'done') then
    raise exception 'El sitio tiene un walkthrough hecho y no se puede eliminar' using errcode = '23514';
  end if;
  return old;
end $$;
create trigger lead_sites_before_delete before delete on lead_sites
  for each row execute function lead_site_before_delete();

grant delete on lead_sites to authenticated;
create policy lead_sites_delete on lead_sites for delete to authenticated using (has_permission('leads_editar'));

-- Historial: editar y eliminar un sitio (con la empresa para leerlo en el Historial, D-198).
create function log_lead_site_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_company text;
begin
  select company into v_company from leads where id = coalesce(new.lead_id, old.lead_id);
  if tg_op = 'UPDATE' then
    if (old.name, old.address) is distinct from (new.name, new.address) then
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (current_profile_id(), 'sitio_editado', 'lead_sites', new.id,
              jsonb_build_object('company', v_company, 'lead_id', new.lead_id,
                                 'antes', jsonb_build_object('name', old.name, 'address', old.address),
                                 'despues', jsonb_build_object('name', new.name, 'address', new.address)));
    end if;
    return new;
  end if;
  -- Al eliminar el lead entero ya queda lead_eliminado; aquí solo los sitios borrados sueltos.
  if v_company is not null then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'sitio_eliminado', 'lead_sites', old.id,
            jsonb_build_object('company', v_company, 'lead_id', old.lead_id, 'name', old.name, 'address', old.address));
  end if;
  return old;
end $$;
create trigger lead_sites_log after update or delete on lead_sites
  for each row execute function log_lead_site_change();

-- D-203: motivos de lead perdido ------------------------------------------------------------------------

-- Un motivo que ya usa algún lead no se borra: se desactiva (deja de ofrecerse y de contarse en Ajustes,
-- y los leads que lo tienen lo siguen mostrando).
alter table lost_reasons add column active boolean not null default true;

-- Papelera de Ajustes (D-113): borra el motivo si nadie lo usa; si lo usa algún lead, lo desactiva.
-- Corre con los permisos de quien llama: las reglas por fila dejan escribir solo al Super Admin (D-114).
create function remove_lost_reason(p_id uuid) returns text
language plpgsql security invoker set search_path = public as $$
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin edita los motivos' using errcode = '42501';
  end if;
  if not exists (select 1 from lost_reasons where id = p_id) then
    raise exception 'El motivo no existe' using errcode = 'P0002';
  end if;
  if exists (select 1 from leads where lost_reason_id = p_id) then
    update lost_reasons set active = false where id = p_id;
    return 'deactivated';
  end if;
  delete from lost_reasons where id = p_id;
  return 'deleted';
end $$;
revoke execute on function remove_lost_reason(uuid) from public, anon;
grant execute on function remove_lost_reason(uuid) to authenticated;

-- Un lead solo puede tomar un motivo activo al pasar a Perdido (o al cambiar de motivo).
create or replace function lead_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status <> 'lost' then
    new.lost_reason_id := null;
    new.lost_note := null;
  end if;
  if new.lost_reason_id is not null
     and (tg_op = 'INSERT' or new.lost_reason_id is distinct from old.lost_reason_id)
     and not exists (select 1 from lost_reasons where id = new.lost_reason_id and active) then
    raise exception 'El motivo ya no está disponible' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

-- Historial de los motivos (cambios de configuración del Super Admin).
create function log_lost_reason_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'motivo_creado', 'lost_reasons', new.id,
            jsonb_build_object('label_es', new.label_es, 'label_en', new.label_en));
    return new;
  elsif tg_op = 'UPDATE' then
    if old.active and not new.active then
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (current_profile_id(), 'motivo_desactivado', 'lost_reasons', new.id,
              jsonb_build_object('label_es', new.label_es, 'label_en', new.label_en));
    elsif (old.label_es, old.label_en, old.active) is distinct from (new.label_es, new.label_en, new.active) then
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (current_profile_id(), 'motivo_editado', 'lost_reasons', new.id,
              jsonb_build_object('antes', jsonb_build_object('label_es', old.label_es, 'label_en', old.label_en, 'active', old.active),
                                 'despues', jsonb_build_object('label_es', new.label_es, 'label_en', new.label_en, 'active', new.active)));
    end if;
    return new;
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'motivo_eliminado', 'lost_reasons', old.id,
          jsonb_build_object('label_es', old.label_es, 'label_en', old.label_en));
  return old;
end $$;
create trigger lost_reasons_log after insert or update or delete on lost_reasons
  for each row execute function log_lost_reason_change();

revoke execute on function lead_site_before_delete(), log_lead_site_change(), log_lost_reason_change(), lead_before_write()
  from public, anon, authenticated;
