-- Orden 160 (D-347, D-348, D-350): fuentes de leads y entrada segura (lead-intake).
-- Requiere 20261122000001_lead_source_valores.sql (valores 'ads' y 'agent' del enum lead_source).
--  · lead_sources: una fila por fuente (anuncios, agentes de IA u otra) con su clave. La clave en claro NUNCA se
--    guarda: se genera aquí, se devuelve una sola vez al crear o rehacer, y se guarda su SHA-256 y sus últimos 4.
--    Solo el Super Admin con sesión aal2 (is_super_admin()) la lee y la edita.
--  · leads: fuente (source_id), temperatura (potential / cold), servicio (recurring / one_time) y detalle libre de
--    la fuente. El website pasa a potential (D-348).
--  · lead_intake (solo service role, la llama la Edge Function lead-intake): valida la clave, limita por fuente,
--    crea o junta (por email o teléfono) y avisa.

-- 1. Fuentes ------------------------------------------------------------------------------------------------------
create table lead_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> '' and length(name) <= 60),
  kind        text not null check (kind in ('ads', 'agent', 'other')),
  enters_as   text not null check (enters_as in ('potential', 'cold')),
  active      boolean not null default true,
  -- SHA-256 (hex) de la clave; null = todavía sin clave (se genera con "rehacer").
  key_hash    text unique check (key_hash is null or key_hash ~ '^[0-9a-f]{64}$'),
  key_last4   text check (key_last4 is null or length(key_last4) = 4),
  lead_count  int not null default 0,
  last_lead_at timestamptz,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index lead_sources_name on lead_sources (lower(btrim(name)));

alter table lead_sources enable row level security;
create policy lead_sources_read on lead_sources for select to authenticated using (is_super_admin());
create policy lead_sources_update on lead_sources for update to authenticated
  using (is_super_admin()) with check (is_super_admin());
revoke all on lead_sources from anon, authenticated;
-- El hash no sale a la app; solo se editan nombre, tipo, "Enters as" y el interruptor. Crear y rehacer la clave van
-- por funciones; no se borra (se apaga).
grant select (id, name, kind, enters_as, active, key_last4, lead_count, last_lead_at, created_at, updated_at)
  on lead_sources to authenticated;
grant update (name, kind, enters_as, active) on lead_sources to authenticated;

create function lead_sources_touch() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.name := btrim(new.name);
  return new;
end $$;
create trigger lead_sources_touch before insert or update on lead_sources for each row execute function lead_sources_touch();

-- Historial de las fuentes (sin la clave).
create function log_lead_source_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'fuente_lead_creada', 'lead_sources', new.id,
            jsonb_build_object('name', new.name, 'kind', new.kind, 'enters_as', new.enters_as));
  elsif new.name is distinct from old.name or new.kind is distinct from old.kind
        or new.enters_as is distinct from old.enters_as or new.active is distinct from old.active then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'fuente_lead_editada', 'lead_sources', new.id,
            jsonb_build_object('name', new.name, 'antes', jsonb_build_object('name', old.name, 'kind', old.kind,
              'enters_as', old.enters_as, 'active', old.active),
              'despues', jsonb_build_object('name', new.name, 'kind', new.kind, 'enters_as', new.enters_as, 'active', new.active)));
  elsif new.key_hash is distinct from old.key_hash then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'fuente_lead_clave', 'lead_sources', new.id, jsonb_build_object('name', new.name));
  end if;
  return new;
end $$;
revoke execute on function log_lead_source_change(), lead_sources_touch() from public, anon, authenticated;
create trigger lead_sources_log after insert or update on lead_sources for each row execute function log_lead_source_change();

-- Semillas (D-347, D-348, D-350): sin clave; el Super Admin la genera en Mi cuenta → Lead sources.
alter table lead_sources disable trigger lead_sources_log;
insert into lead_sources (name, kind, enters_as, active) values
  ('Meta (Facebook + Instagram)', 'ads', 'potential', true),
  ('TikTok', 'ads', 'potential', true),
  ('Muse', 'agent', 'cold', true),
  ('Grok', 'agent', 'cold', false);
alter table lead_sources enable trigger lead_sources_log;

-- Clave nueva: "ccl_" + 48 caracteres hex (192 bits). Devuelve la clave en claro (solo esta vez) y guarda su hash.
create function lead_source_new_key(out v_key text, out v_hash text)
language plpgsql volatile set search_path = public, extensions as $$
begin
  v_key := 'ccl_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_hash := encode(extensions.digest(v_key, 'sha256'), 'hex');
end $$;
revoke execute on function lead_source_new_key() from public, anon, authenticated;

-- "+ Add source" (solo Super Admin aal2): crea la fuente con su clave y la devuelve una sola vez.
create function lead_source_create(p_name text, p_kind text, p_enters_as text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k record;
  v_id uuid;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('ads', 'agent', 'other') or p_enters_as is null
     or p_enters_as not in ('potential', 'cold') or btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) > 60 then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  if exists (select 1 from lead_sources where lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'Ya existe una fuente con ese nombre' using errcode = '23505';
  end if;
  select * into k from lead_source_new_key();
  insert into lead_sources (name, kind, enters_as, key_hash, key_last4, created_by)
  values (p_name, p_kind, p_enters_as, k.v_hash, right(k.v_key, 4), current_profile_id())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'key', k.v_key, 'key_last4', right(k.v_key, 4));
end $$;

-- Rehacer la clave (solo Super Admin aal2): la anterior deja de servir al momento.
create function lead_source_rotate_key(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k record;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin' using errcode = '42501'; end if;
  if not exists (select 1 from lead_sources where id = p_id) then
    raise exception 'La fuente no existe' using errcode = 'P0002';
  end if;
  select * into k from lead_source_new_key();
  update lead_sources set key_hash = k.v_hash, key_last4 = right(k.v_key, 4) where id = p_id;
  return jsonb_build_object('id', p_id, 'key', k.v_key, 'key_last4', right(k.v_key, 4));
end $$;
revoke all on function lead_source_create(text, text, text), lead_source_rotate_key(uuid) from public, anon;
grant execute on function lead_source_create(text, text, text), lead_source_rotate_key(uuid) to authenticated;

-- 2. Leads: fuente, temperatura, servicio --------------------------------------------------------------------------
alter table leads
  add column source_id     uuid references lead_sources(id) on delete set null,
  add column temperature   text check (temperature in ('potential', 'cold')),
  add column service       text not null default 'recurring' check (service in ('recurring', 'one_time')),
  add column source_detail text check (source_detail is null or length(source_detail) <= 100);
create index leads_email_lower on leads (lower(email)) where email is not null;
create index leads_phone_digits on leads (regexp_replace(phone, '\D', '', 'g')) where phone is not null;

-- Datos existentes (D-348): website → potential; lo demás (registro manual y campañas) → cold, que es el flujo de
-- correos de D-332 en el que ya están (D-200). Sin historial: es una migración.
alter table leads disable trigger user;
update leads set temperature = case when source = 'web' then 'potential' else 'cold' end;
alter table leads enable trigger user;
alter table leads alter column temperature set not null;

-- Reglas al escribir (D-349, D-350): residencial solo con one-time; la empresa es obligatoria en un lead manual
-- comercial y opcional en residencial (se nombra por la persona). Los que entran solos (website, anuncios, agentes)
-- pueden llegar sin empresa y se completan después (D-319). Se revisa al crear o cuando cambian esos campos, para no
-- bloquear leads anteriores. Temperatura por defecto según el origen.
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
  if new.status = 'waiting' and new.first_contact_at is null then
    new.first_contact_at := now();
    new.last_contact_at := coalesce(new.last_contact_at, now());
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  if new.temperature is null then
    new.temperature := case when new.source in ('web', 'ads') then 'potential' else 'cold' end;
  end if;
  new.company := nullif(btrim(coalesce(new.company, '')), '');
  if tg_op = 'INSERT' or new.cleaning_type is distinct from old.cleaning_type or new.service is distinct from old.service then
    if new.cleaning_type = 'residential' and new.service <> 'one_time' then
      raise exception 'Residencial solo con one-time' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' or new.company is distinct from old.company or new.cleaning_type is distinct from old.cleaning_type then
    if new.company is null and new.source = 'manual' and new.cleaning_type <> 'residential' then
      raise exception 'La empresa es obligatoria' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- Historial: la fuente nombrada (Meta, Muse…) y el detalle en "Lead creado".
create or replace function log_lead_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'lead_creado', 'leads', new.id,
            jsonb_build_object('company', lead_display_name(new.company, new.contact_name), 'source', new.source,
                               'status', new.status, 'temperature', new.temperature,
                               'source_name', (select name from lead_sources where id = new.source_id),
                               'source_detail', new.source_detail));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status
       or new.lost_reason_id is distinct from old.lost_reason_id
       or new.lost_note is distinct from old.lost_note then
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (current_profile_id(), 'lead_estado_cambiado', 'leads', new.id,
              jsonb_build_object('company', lead_display_name(new.company, new.contact_name), 'antes', old.status, 'despues', new.status,
                                 'lost_reason_id', new.lost_reason_id, 'lost_note', new.lost_note));
    end if;
    return new;
  else
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'lead_eliminado', 'leads', old.id,
            jsonb_build_object('company', lead_display_name(old.company, old.contact_name), 'status', old.status));
    return old;
  end if;
end $$;

-- Chip de la fuente en la lista (campo calculado `source_label`): el detalle ("Instagram ad"), si no el nombre de la
-- fuente; nulo para website y manual (la app pone su texto es/en).
create function source_label(l leads) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(coalesce(l.source_detail, '')), ''), (select name from lead_sources where id = l.source_id))
$$;
revoke all on function source_label(leads) from public, anon;
grant execute on function source_label(leads) to authenticated, service_role;

-- 3. Entrada segura -------------------------------------------------------------------------------------------------
-- Una fila por petición válida (para el límite por fuente y para revisar). Sin datos del lead.
create table lead_intake_log (
  id        bigint generated always as identity primary key,
  source_id uuid not null references lead_sources(id) on delete cascade,
  at        timestamptz not null default now(),
  received  int not null,
  created   int not null,
  merged    int not null,
  rejected  int not null
);
create index lead_intake_log_source on lead_intake_log (source_id, at desc);
alter table lead_intake_log enable row level security;
revoke all on lead_intake_log from anon, authenticated;

-- Límites por clave (D-200): 60 peticiones por hora y 2,000 leads por día; lote de 200 como máximo.
create function lead_intake(p_key_hash text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  src lead_sources;
  it jsonb;
  i int := 0;
  v_created int := 0;
  v_merged int := 0;
  v_rejected int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_company text; v_name text; v_phone text; v_digits text; v_email text; v_city text; v_zip text;
  v_service text; v_property text; v_notes text; v_detail text;
  v_lead uuid;
  v_status lead_status;
  v_when text := to_char(now() at time zone cc_tz(), 'YYYY-MM-DD HH24:MI');
  v_label text;
  v_first uuid;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status', 'unauthorized'); end if;
  select * into src from lead_sources where key_hash = p_key_hash for update;
  if src.id is null or not src.active then return jsonb_build_object('status', 'unauthorized'); end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 200 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if (select count(*) from lead_intake_log where source_id = src.id and at > now() - interval '1 hour') >= 60
     or (select coalesce(sum(received), 0) from lead_intake_log where source_id = src.id and at > now() - interval '1 day')
        + jsonb_array_length(p_items) > 2000 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  v_status := case src.enters_as when 'potential' then 'interested'::lead_status else 'new'::lead_status end;

  for it in select value from jsonb_array_elements(p_items) loop
    i := i + 1;
    if jsonb_typeof(it) <> 'object' then
      v_rejected := v_rejected + 1;
      v_errors := v_errors || jsonb_build_object('index', i - 1, 'reason', 'invalid');
      continue;
    end if;
    -- Red de seguridad (la Edge Function ya limpia): sin etiquetas HTML ni caracteres de control, recortado.
    v_company := nullif(left(btrim(regexp_replace(regexp_replace(coalesce(it->>'company', ''), '<[^>]*>', '', 'g'), '[[:cntrl:]]', ' ', 'g')), 120), '');
    v_name    := nullif(left(btrim(regexp_replace(regexp_replace(coalesce(it->>'contact_name', ''), '<[^>]*>', '', 'g'), '[[:cntrl:]]', ' ', 'g')), 80), '');
    v_email   := lower(btrim(coalesce(it->>'email', '')));
    if v_email !~ '^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$' or length(v_email) > 160 then v_email := null; end if;
    v_digits  := regexp_replace(coalesce(it->>'phone', ''), '\D', '', 'g');
    if length(v_digits) = 11 and left(v_digits, 1) = '1' then v_digits := substr(v_digits, 2); end if;
    if v_digits !~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' then v_digits := null; end if; -- D-216, D-219
    v_phone   := case when v_digits is not null then us_phone_format(v_digits) end;
    v_city    := nullif(left(btrim(regexp_replace(coalesce(it->>'city', ''), '<[^>]*>|[[:cntrl:]]', '', 'g')), 80), '');
    v_zip     := nullif(btrim(coalesce(it->>'zip', '')), '');
    if v_zip is not null and v_zip !~ '^[0-9]{5}(-[0-9]{4})?$' then v_zip := null; end if;
    v_property := case when it->>'property' = 'residential' then 'residential' else 'non_residential' end;
    v_service := case when it->>'service' = 'one_time' or v_property = 'residential' then 'one_time' else 'recurring' end;
    v_notes   := nullif(left(btrim(regexp_replace(coalesce(it->>'notes', ''), '<[^>]*>', '', 'g')), 2000), '');
    v_detail  := nullif(left(btrim(regexp_replace(regexp_replace(coalesce(it->>'source_detail', ''), '<[^>]*>', '', 'g'), '[[:cntrl:]]', ' ', 'g')), 100), '');

    -- Sin a quién llamar o escribir, o sin nombre ni empresa: se rechaza.
    if (v_email is null and v_phone is null) or (v_name is null and v_company is null) then
      v_rejected := v_rejected + 1;
      v_errors := v_errors || jsonb_build_object('index', i - 1, 'reason',
        case when v_email is null and v_phone is null then 'contact_missing' else 'name_missing' end);
      continue;
    end if;

    -- Duplicado (D-350): mismo correo o mismo teléfono en un lead abierto → se junta, no se crea otro.
    select id into v_lead from leads
     where status not in ('won', 'lost')
       and ((v_email is not null and lower(email) = v_email)
            or (v_digits is not null and phone is not null and right(regexp_replace(phone, '\D', '', 'g'), 10) = v_digits))
     order by created_at desc limit 1;

    v_label := src.name || coalesce(' · ' || v_detail, '');
    if v_lead is not null then
      update leads set notes = left(concat_ws(E'\n\n', notes,
          format(E'[%s] Also came in from %s%s%s', v_when, v_label,
            case when v_company is not null or v_name is not null then E'\n' || concat_ws(' · ', v_company, v_name) else '' end,
            case when v_notes is not null then E'\n' || v_notes else '' end)), 20000),
        phone = coalesce(phone, v_phone), email = coalesce(email, v_email),
        contact_name = coalesce(contact_name, v_name), company = coalesce(company, v_company)
       where id = v_lead;
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'lead_juntado', 'leads', v_lead,
              jsonb_build_object('company', (select lead_display_name(company, contact_name) from leads where id = v_lead),
                                 'source_name', src.name, 'source_detail', v_detail));
      v_merged := v_merged + 1;
      continue;
    end if;

    insert into leads (company, contact_name, phone, email, source, source_id, source_detail, temperature, status,
                       service, cleaning_type, notes)
    values (v_company, v_name, v_phone, v_email, case src.kind when 'ads' then 'ads'::lead_source when 'agent' then 'agent'::lead_source else 'campaign'::lead_source end,
            src.id, v_detail, src.enters_as, v_status, v_service, v_property,
            format(E'[%s] From %s%s', v_when, v_label, case when v_notes is not null then E'\n' || v_notes else '' end))
    returning id into v_lead;
    if v_city is not null or v_zip is not null then
      insert into lead_sites (lead_id, name, city, state, zip) values (v_lead, null, v_city, 'FL', v_zip);
    end if;
    v_created := v_created + 1;
    v_first := coalesce(v_first, v_lead);
    -- Cada potencial avisa al momento (D-350), como el website.
    if src.enters_as = 'potential' then
      begin
        perform notify_permission(array['leads_ver'], 'lead_potential',
          jsonb_build_object('name', lead_display_name(v_company, v_name), 'source', v_label),
          jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', v_lead)), false, 'lp:' || v_lead);
      exception when others then null; -- un aviso nunca hace fallar la entrada
      end;
    end if;
  end loop;

  -- Fríos: un solo aviso por lote ("Muse added 12 cold leads", D-350).
  if src.enters_as = 'cold' and v_created > 0 then
    begin
      perform notify_permission(array['leads_ver'], 'leads_cold_batch',
        jsonb_build_object('source', src.name, 'count', v_created),
        case when v_created = 1 then jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', v_first))
             else jsonb_build_object('pathname', '/pipeline', 'params', jsonb_build_object('filter', 'cold')) end,
        false, 'lc:' || src.id || ':' || extract(epoch from clock_timestamp()));
    exception when others then null;
    end;
  end if;

  update lead_sources set lead_count = lead_count + v_created + v_merged,
         last_lead_at = case when v_created + v_merged > 0 then now() else last_lead_at end
   where id = src.id;
  insert into lead_intake_log (source_id, received, created, merged, rejected)
  values (src.id, i, v_created, v_merged, v_rejected);
  return jsonb_build_object('status', 'ok', 'source', src.name, 'created', v_created, 'merged', v_merged,
                            'rejected', v_rejected, 'errors', v_errors);
end $$;
revoke all on function lead_intake(text, jsonb) from public, anon, authenticated;
grant execute on function lead_intake(text, jsonb) to service_role;

-- 4. Inicio (D-350 (2)): potenciales nuevos por llamar (Interesado sin cita todavía). -------------------------------
create function home_leads_potential() returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('leads_ver') then raise exception 'No tienes permiso para ver leads' using errcode = '42501'; end if;
  return (select count(*) from leads where temperature = 'potential' and status = 'interested')::int;
end $$;
revoke all on function home_leads_potential() from public, anon;
grant execute on function home_leads_potential() to authenticated, service_role;

-- 5. Textos de los avisos nuevos (D-200).
CREATE OR REPLACE FUNCTION public.notification_text(p_kind text, d jsonb, lang text, OUT title text, OUT detail text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  es boolean := lang = 'es';
  place text := concat_ws(' · ', nullif(d->>'company', ''), nullif(d->>'site', ''));
  day text := case when d ? 'day' then cc_short_date((d->>'day')::date, lang) end;
begin
  case p_kind
    -- Orden 160 (D-350): lead potencial nuevo (al momento) y lote de fríos de un agente (un aviso por lote).
    when 'lead_potential' then
      title := case when es then 'Nuevo lead potencial' else 'New potential lead' end || coalesce(' · ' || nullif(d->>'source', ''), '');
      detail := d->>'name';
    when 'leads_cold_batch' then
      title := case when es then (d->>'source') || ' agregó ' || (d->>'count') || case when (d->>'count') = '1' then ' lead en frío' else ' leads en frío' end
                    else (d->>'source') || ' added ' || (d->>'count') || case when (d->>'count') = '1' then ' cold lead' else ' cold leads' end end;
      detail := null;
    when 'quote_viewed' then title := case when es then 'Quote visto' else 'Quote viewed' end; detail := place;
    when 'quote_accepted' then title := case when es then 'Quote aceptado' else 'Quote accepted' end; detail := place;
    when 'quote_rejected' then title := case when es then 'Quote rechazado' else 'Quote rejected' end; detail := place;
    when 'quote_changes' then title := case when es then 'Nueva versión solicitada' else 'New version requested' end; detail := place;
    when 'quote_expiring' then
      title := case when es then 'Quote por vencer' else 'Quote expiring' end;
      detail := concat_ws(' · ', place, case when es then 'vence el ' else 'expires ' end || day);
    when 'quote_expired' then title := case when es then 'Quote expirado' else 'Quote expired' end; detail := place;
    when 'walkthrough_scheduled' then
      title := case when es then 'Walkthrough agendado' else 'Walkthrough scheduled' end;
      detail := concat_ws(' · ', place, day || ' ' || coalesce(d->>'time', ''));
    when 'followup_due' then title := case when es then 'Seguimiento de lead pendiente' else 'Lead follow-up due' end; detail := d->>'company';
    when 'schedule_changed' then
      title := case when es then 'Horario nuevo o cambiado' else 'New or changed schedule' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'schedule_removed' then
      title := case when es then 'Te quitaron de una visita' else 'You were removed from a visit' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'visit_soon' then
      title := case when es then 'Visita en las próximas horas' else 'Visit in the next few hours' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'time');
    when 'work_to_approve' then
      title := case when es then 'Trabajo pendiente de aprobar' else 'Work pending approval' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'gps_out' then
      title := case when es then 'Clock in con GPS fuera de rango' else 'Clock in with GPS out of range' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'name');
    when 'clock_in_forgotten' then
      title := case when es then 'Clock in olvidado' else 'Forgotten clock in' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'name');
    when 'clock_out_forgotten' then
      title := case when es then 'Clock out olvidado' else 'Forgotten clock out' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'name', day);
    when 'service_day_returned' then
      title := case when es then 'Día de servicio: requiere corrección' else 'Service day: needs correction' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'job_offer' then
      title := case when es then 'Nueva oferta de trabajo' else 'New job offer' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'warnings_3' then
      title := case when es then (d->>'name') || ' tiene ' || (d->>'count') || ' advertencias escritas'
                    else (d->>'name') || ' has ' || (d->>'count') || ' written warnings' end;
      detail := case when es then 'Revisa si corresponde terminar el contrato por escrito.'
                     else 'Review whether to end the agreement by written notice.' end;
    when 'work_approved' then
      title := case when es then 'Trabajo aprobado' else 'Work approved' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'income_unmarked' then
      title := case when es then 'Ingreso esperado sin marcar como recibido' else 'Expected income not marked as received' end;
      detail := (d->>'count') || case when es then ' de ' else ' in ' end || cc_month_name((d->>'month')::date, lang);
    when 'margin_alert' then title := case when es then 'Alerta de margen' else 'Margin alert' end; detail := d->>'jobsite';
    when 'recurring_generated' then
      title := case when es then 'Gasto recurrente generado' else 'Recurring expense created' end;
      detail := concat_ws(' · ', d->>'name', '$' || to_char((d->>'amount')::numeric, 'FM999,999,990.00'));
    when 'hours_32' then
      title := case when es then 'Alerta de 32 h semanales' else '32 h weekly alert' end;
      detail := (d->>'name') || case when es then ' lleva ' else ' has ' end || (d->>'hours') || ' h';
    when 'permissions_changed' then
      title := case when es then 'Cambio de permisos' else 'Permissions changed' end;
      detail := case when es then 'Revisa lo que puedes ver en la app.' else 'Check what you can see in the app.' end;
    when 'terms_new' then
      title := case when es then 'Nueva versión de términos y condiciones por aceptar' else 'New terms and conditions to accept' end;
      detail := (case when es then 'Versión ' else 'Version ' end) || (d->>'version');
    -- D-200: Política de Privacidad nueva; "por aceptar" solo si es un cambio importante.
    when 'privacy_new' then
      title := case when coalesce((d->>'major')::boolean, true)
                    then case when es then 'Nueva Política de Privacidad por aceptar' else 'New Privacy Policy to accept' end
                    else case when es then 'Política de Privacidad actualizada' else 'Privacy Policy updated' end end;
      detail := (case when es then 'Versión ' else 'Version ' end) || (d->>'version');
    when 'w9_signed' then
      title := case when es then 'W-9 firmado' else 'W-9 signed' end;
      detail := d->>'name';
    -- Orden 57 (D-282): solicitud de eliminación de cuenta, al Super Admin.
    when 'account_deletion_requested' then
      title := case when es then 'Solicitud de eliminación de cuenta' else 'Account deletion request' end;
      detail := d->>'name';
    else title := p_kind; detail := null;
  end case;
end $function$;

-- 6. Pasar un lead a residencial lo deja en one-time (D-349: residencial solo en one-time).
CREATE OR REPLACE FUNCTION public.set_lead_cleaning_type(p_lead uuid, p_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l leads;
begin
  if not has_permission('leads_editar') then
    raise exception 'No tienes permiso para editar leads' using errcode = '42501';
  end if;
  if p_type is null or p_type not in ('non_residential', 'residential') then
    raise exception 'Tipo no válido' using errcode = '22023';
  end if;
  select * into l from leads where id = p_lead for update;
  if l.id is null then raise exception 'El lead no existe' using errcode = 'P0002'; end if;
  if l.cleaning_type = p_type then return; end if;
  update leads set cleaning_type = p_type,
    service = case when p_type = 'residential' then 'one_time' else service end where id = p_lead;
  -- Al volver a no residencial las líneas quedan sin gravable: se marcan otra vez a mano (como hoy).
  update quote_versions v set lines = v.lines
    from quotes q where q.id = v.quote_id and q.lead_id = p_lead and v.status = 'draft';
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'tipo_limpieza_cambiado', 'leads', p_lead,
          jsonb_build_object('company', l.company, 'antes', l.cleaning_type, 'despues', p_type));
end $function$;
