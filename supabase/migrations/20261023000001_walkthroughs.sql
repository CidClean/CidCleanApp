-- Hito 3, Ventas B: walkthrough del sitio, con versiones y fotos.
-- Fuente: current/flujo.md ("Ventas 2: Walkthrough", "Reglas transversales": sin internet y versionado),
-- current/arquitectura.md (sin conexión solo el walkthrough, cola de fotos, Storage privado), current/permisos.md,
-- D-003, D-004, D-037, D-073 a D-075, D-080, D-105, D-106, D-125, D-127, D-202.
--
-- El teléfono arma el walkthrough sin conexión y lo manda entero (un documento JSON) cuando hay señal:
--   save_walkthrough  guarda el borrador (crea el walkthrough la primera vez, con el id que generó el teléfono);
--   las fotos se suben al bucket privado walkthrough-photos en <walkthrough>/<foto>.<ext>;
--   close_walkthrough cierra: crea la versión 1 (o la siguiente, si es una corrección), pasa la cita a hecha y
--   el lead a Walkthrough hecho. Cada versión cerrada se conserva (versionado).
-- Permisos: hacer y corregir con walkthroughs_hacer; corregir también con clientes_editar_walkthrough_sow;
-- ver con walkthroughs_hacer, leads_ver o clientes_editar_walkthrough_sow.

create type walkthrough_doc_status as enum ('draft', 'closed');

-- Un walkthrough por sitio (D-003, flujo).
create table walkthroughs (
  id              uuid primary key,
  site_id         uuid not null unique references lead_sites(id) on delete cascade,
  appointment_id  uuid references walkthrough_appointments(id) on delete set null,
  status          walkthrough_doc_status not null default 'draft',
  draft           jsonb not null default '{}'::jsonb,
  current_version int not null default 0,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz,
  constraint walkthroughs_draft_object check (jsonb_typeof(draft) = 'object')
);

-- Versiones cerradas: lo que se revisó y se cerró, sin cambios después (D-004 versionado).
create table walkthrough_versions (
  walkthrough_id uuid not null references walkthroughs(id) on delete cascade,
  version        int not null check (version >= 1),
  data           jsonb not null check (jsonb_typeof(data) = 'object'),
  pdf_path       text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  primary key (walkthrough_id, version)
);

create function can_see_walkthroughs() returns boolean
language sql stable security definer set search_path = public as $$
  select has_permission('walkthroughs_hacer') or has_permission('leads_ver')
      or has_permission('clientes_editar_walkthrough_sow')
$$;

alter table walkthroughs enable row level security;
alter table walkthrough_versions enable row level security;
create policy walkthroughs_read on walkthroughs for select to authenticated using (can_see_walkthroughs());
create policy walkthrough_versions_read on walkthrough_versions for select to authenticated using (can_see_walkthroughs());
-- Sin escritura directa: todo cambio pasa por save_walkthrough y close_walkthrough.
revoke all on walkthroughs, walkthrough_versions from anon;
revoke insert, update, delete, truncate, references, trigger on walkthroughs, walkthrough_versions from authenticated;

create trigger walkthroughs_touch before update on walkthroughs for each row execute function touch_updated_at();

-- D-202: un sitio con walkthrough cerrado tampoco se borra suelto (además de la cita hecha).
create or replace function lead_site_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from leads where id = old.lead_id)
     and (exists (select 1 from walkthrough_appointments where site_id = old.id and status = 'done')
          or exists (select 1 from walkthroughs where site_id = old.id and current_version > 0)) then
    raise exception 'El sitio tiene un walkthrough hecho y no se puede eliminar' using errcode = '23514';
  end if;
  return old;
end $$;

-- Guardar el borrador (también sin cerrar; el teléfono lo manda cada vez que hay señal).
create function save_walkthrough(p_id uuid, p_site uuid, p_appointment uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  w walkthroughs;
  v_company text;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'El walkthrough no es válido' using errcode = '22023';
  end if;
  select * into w from walkthroughs where id = p_id for update;
  if w.id is null then
    if not has_permission('walkthroughs_hacer') then
      raise exception 'No tienes permiso para hacer walkthroughs' using errcode = '42501';
    end if;
    select l.company into v_company from lead_sites s join leads l on l.id = s.lead_id where s.id = p_site;
    if v_company is null then
      raise exception 'El sitio no existe' using errcode = 'P0002';
    end if;
    if exists (select 1 from walkthroughs where site_id = p_site) then
      raise exception 'Este sitio ya tiene un walkthrough' using errcode = '23505';
    end if;
    if p_appointment is not null and not exists (
      select 1 from walkthrough_appointments where id = p_appointment and site_id = p_site) then
      raise exception 'La cita no es de este sitio' using errcode = '22023';
    end if;
    insert into walkthroughs (id, site_id, appointment_id, draft, created_by)
    values (p_id, p_site, p_appointment, p_data, current_profile_id());
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'walkthrough_iniciado', 'walkthroughs', p_id,
            jsonb_build_object('company', v_company, 'site_id', p_site));
    return;
  end if;
  if w.site_id <> p_site then
    raise exception 'El walkthrough es de otro sitio' using errcode = '22023';
  end if;
  -- Antes de cerrar lo edita quien hace walkthroughs; ya cerrado (corrección) también quien edita walkthrough y SOW.
  if not (has_permission('walkthroughs_hacer')
          or (w.status = 'closed' and has_permission('clientes_editar_walkthrough_sow'))) then
    raise exception 'No tienes permiso para editar este walkthrough' using errcode = '42501';
  end if;
  update walkthroughs set draft = p_data where id = p_id;
end $$;

-- Cerrar (o guardar una corrección): crea la versión siguiente con el borrador, que ya debe tener sus fotos subidas.
create function close_walkthrough(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  w walkthroughs;
  v_lead uuid;
  v_company text;
  v_missing int;
  v_version int;
begin
  select * into w from walkthroughs where id = p_id for update;
  if w.id is null then
    raise exception 'El walkthrough no existe' using errcode = 'P0002';
  end if;
  if not (has_permission('walkthroughs_hacer')
          or (w.status = 'closed' and has_permission('clientes_editar_walkthrough_sow'))) then
    raise exception 'No tienes permiso para cerrar este walkthrough' using errcode = '42501';
  end if;
  -- Todas las fotos del borrador tienen que estar en el almacenamiento (la cola las sube antes de cerrar).
  select count(*) into v_missing
    from jsonb_array_elements(coalesce(w.draft->'areas', '[]'::jsonb)) a,
         jsonb_array_elements(coalesce(a->'photos', '[]'::jsonb)) ph
   where not exists (select 1 from storage.objects o
                      where o.bucket_id = 'walkthrough-photos' and o.name = ph->>'path');
  if v_missing > 0 then
    raise exception 'Faltan % fotos por subir', v_missing using errcode = '22023';
  end if;

  v_version := w.current_version + 1;
  insert into walkthrough_versions (walkthrough_id, version, data, created_by)
  values (p_id, v_version, w.draft, current_profile_id());
  update walkthroughs set status = 'closed', current_version = v_version,
         closed_at = coalesce(closed_at, now()) where id = p_id;

  select l.id, l.company into v_lead, v_company
    from lead_sites s join leads l on l.id = s.lead_id where s.id = w.site_id;
  if v_version = 1 then
    -- La cita del sitio pasa a hecha y el lead a Walkthrough hecho (sin retroceder un lead más avanzado).
    update walkthrough_appointments set status = 'done'
     where site_id = w.site_id and status = 'scheduled';
    update leads set status = 'walkthrough_done'
     where id = v_lead and status in ('new', 'contacted', 'walkthrough_scheduled');
  end if;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), case when v_version = 1 then 'walkthrough_cerrado' else 'walkthrough_corregido' end,
          'walkthroughs', p_id, jsonb_build_object('company', v_company, 'site_id', w.site_id, 'version', v_version));
  return v_version;
end $$;

-- Fotos: bucket privado (current/arquitectura.md). Se guardan mientras el cliente esté activo y 3 años después (D-127,
-- pendiente de confirmar): la limpieza se programa cuando exista el estado del cliente (hito 5).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('walkthrough-photos', 'walkthrough-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Subir: quien hace walkthroughs (o corrige), solo dentro de la carpeta de un walkthrough que existe.
create function walkthrough_photo_folder_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from walkthroughs w where w.id::text = split_part(p_name, '/', 1))
     and (has_permission('walkthroughs_hacer') or has_permission('clientes_editar_walkthrough_sow'))
$$;

create policy walkthrough_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'walkthrough-photos' and walkthrough_photo_folder_ok(name));
create policy walkthrough_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'walkthrough-photos' and can_see_walkthroughs());

revoke execute on function save_walkthrough(uuid, uuid, uuid, jsonb), close_walkthrough(uuid),
  can_see_walkthroughs(), walkthrough_photo_folder_ok(text) from public, anon;
grant execute on function save_walkthrough(uuid, uuid, uuid, jsonb), close_walkthrough(uuid),
  can_see_walkthroughs(), walkthrough_photo_folder_ok(text) to authenticated;
revoke execute on function lead_site_before_delete() from public, anon, authenticated;
