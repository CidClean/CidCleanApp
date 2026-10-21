-- Hito 2, Ventas A: leads, sitios del lead, citas de walkthrough, seguimientos y motivos de lead perdido.
-- Fuente: current/flujo.md ("Ventas 1: Lead", "Listas de partida"), current/permisos.md (Ventas),
-- D-003, D-070, D-071, D-072, D-078, D-079, D-104, D-107, D-114, D-125, D-169.
-- Permisos: leads_ver (ver), leads_editar (crear y editar, cambiar estado, sitios, citas y seguimientos),
-- leads_eliminar (eliminar), walkthroughs_hacer (ver sitios y citas para hacer el walkthrough).

create type lead_source as enum ('web', 'campaign', 'manual');
create type lead_status as enum (
  'new', 'contacted', 'walkthrough_scheduled', 'walkthrough_done', 'quote_sent', 'negotiation', 'won', 'lost'
);
create type walkthrough_status as enum ('scheduled', 'done', 'canceled');

-- Motivos de lead perdido (D-107): ocho de partida, se editan en Ajustes (solo el Super Admin, D-114).
-- La misma lista sirve para el rechazo del quote (D-108, hito 4). Las etiquetas viven aquí en los dos idiomas
-- porque el Super Admin podrá agregar motivos propios.
create table lost_reasons (
  id         uuid primary key default gen_random_uuid(),
  label_es   text not null check (btrim(label_es) <> ''),
  label_en   text not null check (btrim(label_en) <> ''),
  sort       int  not null,
  created_at timestamptz not null default now()
);

insert into lost_reasons (label_es, label_en, sort) values
  ('Precio', 'Price', 1),
  ('Eligió a otra compañía', 'Chose another company', 2),
  ('Sin respuesta', 'No response', 3),
  ('Ya no necesita el servicio', 'No longer needs the service', 4),
  ('Cambió el alcance', 'Scope changed', 5),
  ('Trabajo muy grande o muy pequeño', 'Job too big or too small', 6),
  ('Fuera de la zona de servicio', 'Outside the service area', 7),
  ('Otro', 'Other', 8);

-- Lead: la empresa con datos justos para hacer contacto (D-003).
create table leads (
  id                uuid primary key default gen_random_uuid(),
  company           text not null check (btrim(company) <> ''),
  contact_name      text,
  phone             text,
  email             text,
  source            lead_source not null default 'manual',
  notes             text,
  status            lead_status not null default 'new',
  lost_reason_id    uuid references lost_reasons(id),
  lost_note         text,
  status_changed_at timestamptz not null default now(),
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Perdido siempre lleva motivo (D-079); los demás estados no llevan motivo ni nota de perdido.
  constraint leads_lost_reason check ((status = 'lost') = (lost_reason_id is not null)),
  constraint leads_lost_note check (status = 'lost' or lost_note is null)
);
create index leads_created_at on leads (created_at desc);

-- Sitios del lead: cada uno tendrá su walkthrough y su quote (D-003).
create table lead_sites (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  name       text,
  address    text not null check (btrim(address) <> ''),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lead_sites_lead on lead_sites (lead_id);

-- Cita del walkthrough: se registra como cita, no solo como estado (flujo, D-072, D-078).
create table walkthrough_appointments (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references lead_sites(id) on delete cascade,
  starts_at  timestamptz not null,
  status     walkthrough_status not null default 'scheduled',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Una cita agendada a la vez por sitio: agendar de nuevo la mueve.
create unique index walkthrough_one_scheduled_per_site on walkthrough_appointments (site_id) where status = 'scheduled';
create index walkthrough_starts_at on walkthrough_appointments (starts_at);

-- Seguimiento del lead: fecha en que hay que volver a contactarlo. Uno abierto a la vez por lead.
create table lead_followups (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  due_on     date not null,
  done_at    timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create unique index lead_followups_one_open on lead_followups (lead_id) where done_at is null;

-- Quién creó cada cosa: lo pone la base de datos, no la app.
create function set_created_by() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_by := current_profile_id();
  return new;
end $$;

-- Al editar no se cambia quién ni cuándo se creó.
create function keep_created_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end $$;

-- Estado del lead: fecha del cambio y, fuera de Perdido, sin motivo ni nota de perdido.
create function lead_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status <> 'lost' then
    new.lost_reason_id := null;
    new.lost_note := null;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

create trigger leads_created_by before insert on leads for each row execute function set_created_by();
create trigger leads_before_write before insert or update on leads for each row execute function lead_before_write();
create trigger leads_touch before update on leads for each row execute function touch_updated_at();
create trigger lead_sites_created_by before insert on lead_sites for each row execute function set_created_by();
create trigger lead_sites_touch before update on lead_sites for each row execute function touch_updated_at();
create trigger walkthrough_created_by before insert on walkthrough_appointments for each row execute function set_created_by();
create trigger walkthrough_touch before update on walkthrough_appointments for each row execute function touch_updated_at();
create trigger lead_followups_created_by before insert on lead_followups for each row execute function set_created_by();
create trigger leads_keep_created before update on leads for each row execute function keep_created_fields();
create trigger lead_sites_keep_created before update on lead_sites for each row execute function keep_created_fields();
create trigger walkthrough_keep_created before update on walkthrough_appointments for each row execute function keep_created_fields();
create trigger lead_followups_keep_created before update on lead_followups for each row execute function keep_created_fields();

-- Historial (D-125): creación, cambios de estado y eliminación del lead; citas agendadas y movidas.
create function log_lead_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'lead_creado', 'leads', new.id,
            jsonb_build_object('company', new.company, 'source', new.source, 'status', new.status));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status
       or new.lost_reason_id is distinct from old.lost_reason_id
       or new.lost_note is distinct from old.lost_note then
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (current_profile_id(), 'lead_estado_cambiado', 'leads', new.id,
              jsonb_build_object('company', new.company, 'antes', old.status, 'despues', new.status,
                                 'lost_reason_id', new.lost_reason_id, 'lost_note', new.lost_note));
    end if;
    return new;
  else
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'lead_eliminado', 'leads', old.id,
            jsonb_build_object('company', old.company, 'status', old.status));
    return old;
  end if;
end $$;
create trigger leads_log after insert or update or delete on leads
  for each row execute function log_lead_change();

create function log_walkthrough_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lead uuid;
  v_company text;
begin
  select l.id, l.company into v_lead, v_company
    from lead_sites s join leads l on l.id = s.lead_id where s.id = new.site_id;
  if tg_op = 'INSERT' then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'walkthrough_agendado', 'walkthrough_appointments', new.id,
            jsonb_build_object('company', v_company, 'lead_id', v_lead, 'site_id', new.site_id, 'starts_at', new.starts_at));
  elsif new.starts_at is distinct from old.starts_at or new.status is distinct from old.status then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(),
            case when new.status is distinct from old.status then 'walkthrough_estado_cambiado' else 'walkthrough_reagendado' end,
            'walkthrough_appointments', new.id,
            jsonb_build_object('company', v_company, 'lead_id', v_lead, 'site_id', new.site_id,
                               'antes', jsonb_build_object('starts_at', old.starts_at, 'status', old.status),
                               'despues', jsonb_build_object('starts_at', new.starts_at, 'status', new.status)));
  end if;
  return new;
end $$;
create trigger walkthrough_log after insert or update on walkthrough_appointments
  for each row execute function log_walkthrough_change();

-- Reglas por fila ----------------------------------------------------------------------------------

alter table lost_reasons             enable row level security;
alter table leads                    enable row level security;
alter table lead_sites               enable row level security;
alter table walkthrough_appointments enable row level security;
alter table lead_followups           enable row level security;

-- Motivos: los leen quienes ven o editan leads y el Super Admin; solo el Super Admin los cambia (D-114).
create policy lost_reasons_read on lost_reasons for select to authenticated
  using (has_permission('leads_ver') or has_permission('leads_editar'));
create policy lost_reasons_insert on lost_reasons for insert to authenticated with check (is_super_admin());
create policy lost_reasons_update on lost_reasons for update to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy lost_reasons_delete on lost_reasons for delete to authenticated using (is_super_admin());

create policy leads_read   on leads for select to authenticated using (has_permission('leads_ver'));
create policy leads_insert on leads for insert to authenticated with check (has_permission('leads_editar'));
create policy leads_update on leads for update to authenticated
  using (has_permission('leads_editar')) with check (has_permission('leads_editar'));
create policy leads_delete on leads for delete to authenticated using (has_permission('leads_eliminar'));

-- Sitios y citas: también los ve quien hace walkthroughs (necesita la dirección y la hora).
create policy lead_sites_read on lead_sites for select to authenticated
  using (has_permission('leads_ver') or has_permission('walkthroughs_hacer'));
create policy lead_sites_insert on lead_sites for insert to authenticated with check (has_permission('leads_editar'));
create policy lead_sites_update on lead_sites for update to authenticated
  using (has_permission('leads_editar')) with check (has_permission('leads_editar'));

create policy walkthrough_read on walkthrough_appointments for select to authenticated
  using (has_permission('leads_ver') or has_permission('walkthroughs_hacer'));
create policy walkthrough_insert on walkthrough_appointments for insert to authenticated
  with check (has_permission('leads_editar'));
create policy walkthrough_update on walkthrough_appointments for update to authenticated
  using (has_permission('leads_editar')) with check (has_permission('leads_editar'));

create policy lead_followups_read on lead_followups for select to authenticated using (has_permission('leads_ver'));
create policy lead_followups_insert on lead_followups for insert to authenticated
  with check (has_permission('leads_editar'));
create policy lead_followups_update on lead_followups for update to authenticated
  using (has_permission('leads_editar')) with check (has_permission('leads_editar'));

-- Sin acceso anónimo. Sitios, citas y seguimientos no se borran sueltos: se van con su lead.
revoke all on lost_reasons, leads, lead_sites, walkthrough_appointments, lead_followups from anon;
revoke delete on lead_sites, walkthrough_appointments, lead_followups from authenticated;
revoke truncate, references, trigger on lost_reasons, leads, lead_sites, walkthrough_appointments, lead_followups
  from authenticated;

-- Los disparadores no se llaman desde la API.
revoke execute on function set_created_by(), keep_created_fields(), lead_before_write(), log_lead_change(),
  log_walkthrough_change()
  from public, anon, authenticated;
