-- Orden 65 (legal rev. 3, fase D, D-285): Independent Contractor Agreement (ICA, plantilla 1.0 de
-- legal/rev3/6_Independent_Contractor_Agreement_EN.pdf, D-287) para los contratistas 1099. Mismo patrón que el contrato
-- del cliente (20261030000013): el Super Admin lo prepara (campos rellenados del perfil y del W-9; lo que falte lo
-- completa él), lo envía (link por correo de un solo uso, 15 días, y código de 6 dígitos), el contratista firma en el
-- portal en inglés (nombre, correo verificado, fecha y hora, IP, navegador y consentimiento) y el Super Admin
-- contrafirma; el PDF firmado lleva la hoja de certificado al final. Alternativa: el Super Admin sube el ICA firmado en
-- papel (queda "Firmado por ambas partes", con quién lo subió).
-- Regla (D-285): a un 1099 no se le asigna trabajo nuevo (asignación a un jobsite, persona en una visita, oferta o día de
-- servicio nuevo) sin el ICA "Firmado por ambas partes" y el W-9 firmado. Los 1099 que ya trabajan quedan como "ICA
-- pendiente (anterior a la app)" y la regla solo frena asignaciones NUEVAS a jobsites donde no estaban (por confirmar
-- con el dueño).
-- Archivos en el bucket privado contractor-docs (sin políticas: solo las funciones con la service role).
-- Las tablas no tienen políticas: todo pasa por funciones (Super Admin con su JWT; portal con la service role).

create sequence ica_number_seq;

create table contractor_agreements (
  id                      uuid primary key default gen_random_uuid(),
  number                  bigint not null unique default nextval('ica_number_seq'),
  profile_id              uuid not null references profiles(id) on delete restrict,
  template_version        text not null default '1.0',
  source                  text not null default 'electronic' check (source in ('electronic', 'paper')),
  status                  text not null default 'draft' check (status in ('draft', 'sent', 'contractor_signed', 'signed', 'void')),
  fields                  jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object'),
  unsigned_path           text,
  unsigned_sha256         text check (unsigned_sha256 is null or unsigned_sha256 ~ '^[0-9a-f]{64}$'),
  token_hash              text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  email                   text,
  sent_by                 uuid references profiles(id),
  sent_at                 timestamptz,
  expires_at              timestamptz,
  viewed_at               timestamptz,
  contractor_signer_name  text check (contractor_signer_name is null or length(contractor_signer_name) <= 120),
  contractor_signer_email text,
  contractor_signed_at    timestamptz,
  contractor_ip           text,
  contractor_user_agent   text,
  contractor_consent      boolean,
  contractor_signature_id uuid,
  cc_signer_id            uuid references profiles(id),
  cc_signer_name          text,
  cc_signer_title         text,
  cc_signed_at            timestamptz,
  cc_ip                   text,
  cc_user_agent           text,
  cc_signature_id         uuid,
  signed_path             text,
  signed_sha256           text check (signed_sha256 is null or signed_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by             uuid references profiles(id),
  uploaded_at             timestamptz,
  created_by              uuid references profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint contractor_agreements_sig check (status not in ('contractor_signed', 'signed') or source = 'paper' or
    (contractor_signer_name is not null and contractor_signed_at is not null and contractor_consent)),
  constraint contractor_agreements_cc check (status <> 'signed' or (signed_path is not null and
    (source = 'paper' and uploaded_by is not null or source = 'electronic' and cc_signer_id is not null and cc_signed_at is not null)))
);
-- Un ICA vivo por contratista.
create unique index contractor_agreements_open on contractor_agreements (profile_id) where status <> 'void';
create trigger contractor_agreements_touch before update on contractor_agreements for each row execute function touch_updated_at();

create table ica_portal_codes (
  id           uuid primary key default gen_random_uuid(),
  seq          bigint generated always as identity,
  agreement_id uuid not null references contractor_agreements(id) on delete cascade,
  email        text not null,
  code_hash    text not null,
  attempts     int not null default 0,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz
);
create index ica_portal_codes_lookup on ica_portal_codes (agreement_id, email, seq desc);

create table ica_portal_sessions (
  token_hash   text primary key,
  agreement_id uuid not null references contractor_agreements(id) on delete cascade,
  email        text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

-- 1099 que ya trabajaban antes de la app: los jobsites donde estaban (la regla no los frena ahí).
create table contractor_ica_legacy (
  profile_id uuid not null references profiles(id) on delete cascade,
  jobsite_id uuid not null references jobsites(id) on delete cascade,
  marked_at  timestamptz not null default now(),
  primary key (profile_id, jobsite_id)
);

alter table contractor_agreements enable row level security;
alter table ica_portal_codes enable row level security;
alter table ica_portal_sessions enable row level security;
alter table contractor_ica_legacy enable row level security;
revoke all on contractor_agreements, ica_portal_codes, ica_portal_sessions, contractor_ica_legacy from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contractor-docs', 'contractor-docs', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Campos de la plantilla 1.0 ---------------------------------------------------------------------------------------
-- Las llaves son las de supabase/functions/_shared/legal/ica-1.0.ts (más ica_no y template_version, automáticas).
create function ica_editable_keys() returns text[]
language sql immutable as $$
  select array['effective_date', 'contractor_name', 'contractor_entity', 'contractor_address', 'contractor_email',
    'contractor_phone', 'business_name', 'sched_site_1', 'sched_rate_1', 'sched_site_2', 'sched_rate_2', 'cc_title']
$$;

-- Los que deben estar para enviar (el negocio y la Schedule A son opcionales: la tarifa puede ir en la oferta, §5).
create function ica_required_keys() returns text[]
language sql immutable as $$
  select array['effective_date', 'contractor_name', 'contractor_entity', 'contractor_address', 'contractor_email',
    'contractor_phone', 'cc_title']
$$;

create function ica_missing_fields(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(k order by k), '{}') from unnest(ica_required_keys()) k where btrim(coalesce(p->>k, '')) = ''
$$;

-- Clasificación del W-9 en el texto del ICA ("individual / entity type").
create function ica_entity_text(d jsonb) returns text
language sql immutable as $$
  select case d->>'classification'
    when 'individual' then 'an individual'
    when 'c_corp' then 'a C corporation'
    when 's_corp' then 'an S corporation'
    when 'partnership' then 'a partnership'
    when 'trust_estate' then 'a trust/estate'
    when 'llc' then 'a limited liability company'
    when 'other' then nullif(d->>'other', '')
    else '' end
$$;

-- Datos del perfil (nombre, dirección, correo, teléfono) y del último W-9 firmado (negocio y tipo); Schedule A con las
-- asignaciones vigentes con pago fijo por visita (hasta dos, como la plantilla).
create function ica_default_fields(p_profile uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p profiles; w jsonb; s1 text := ''; r1 text := ''; s2 text := ''; r2 text := ''; i int := 0; x record;
begin
  select * into p from profiles where id = p_profile;
  select data into w from w9_signatures where profile_id = p_profile order by signed_at desc limit 1;
  for x in
    select j.name, (select ap.fixed_amount from assignment_pay ap where ap.assignment_id = a.id and ap.kind = 'fixed'
                     and ap.fixed_period = 'visit' and ap.effective_from <= cc_today() order by ap.effective_from desc limit 1) amount
      from jobsite_assignments a join jobsites j on j.id = a.jobsite_id
     where a.profile_id = p_profile and (a.end_date is null or a.end_date >= cc_today()) and j.status <> 'terminated'
     order by a.start_date, j.name
  loop
    continue when x.amount is null;
    i := i + 1;
    if i = 1 then s1 := x.name; r1 := '$' || to_char(x.amount, 'FM999,990.00');
    elsif i = 2 then s2 := x.name; r2 := '$' || to_char(x.amount, 'FM999,990.00');
    end if;
  end loop;
  return jsonb_build_object(
    'effective_date', to_char(cc_today(), 'MM/DD/YYYY'),
    'contractor_name', coalesce(nullif(btrim(w->>'name'), ''), nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.full_name, ''),
    'contractor_entity', coalesce(ica_entity_text(w), ''),
    'contractor_address', coalesce(nullif(concat_ws(', ', nullif(btrim(p.address_line1), ''), nullif(btrim(p.address_line2), ''),
                              nullif(btrim(p.city), ''), btrim(concat_ws(' ', nullif(btrim(p.state), ''), nullif(btrim(p.zip), '')))), ''),
                            nullif(concat_ws(', ', nullif(w->>'address', ''), nullif(w->>'city', '')), ''), ''),
    'contractor_email', coalesce(p.email, ''),
    'contractor_phone', coalesce(p.phone, ''),
    'business_name', coalesce(w->>'business', ''),
    'sched_site_1', s1, 'sched_rate_1', r1, 'sched_site_2', s2, 'sched_rate_2', r2,
    'cc_title', 'Managing Member');
end $$;

create function ica_json(c contractor_agreements) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'profile_id', c.profile_id, 'contractor', p.full_name, 'status', c.status, 'source', c.source,
    'ica', contract_label('ICA', c.number), 'template_version', c.template_version,
    'fields', c.fields, 'editable', to_jsonb(ica_editable_keys()), 'missing', to_jsonb(ica_missing_fields(c.fields)),
    'email', c.email, 'sent_at', c.sent_at, 'expires_at', c.expires_at, 'viewed_at', c.viewed_at,
    'contractor_signer_name', c.contractor_signer_name, 'contractor_signer_email', c.contractor_signer_email,
    'contractor_signed_at', c.contractor_signed_at, 'contractor_ip', c.contractor_ip,
    'contractor_user_agent', c.contractor_user_agent, 'contractor_signature_id', c.contractor_signature_id,
    'cc_signer_name', c.cc_signer_name, 'cc_signer_title', c.cc_signer_title, 'cc_signed_at', c.cc_signed_at,
    'uploaded_by', (select full_name from profiles where id = c.uploaded_by), 'uploaded_at', c.uploaded_at,
    'signed', c.signed_path is not null)
    from profiles p where p.id = c.profile_id
$$;

-- Estado de la regla de D-285 ------------------------------------------------------------------------------------

create function w9_is_signed(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profile_documents where profile_id = p_profile and kind = 'w9' and replaced_at is null)
$$;

create function ica_is_signed(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from contractor_agreements where profile_id = p_profile and status = 'signed')
$$;

-- ¿Se le puede dar trabajo nuevo en este jobsite? Los W-2 siempre; un 1099 con ICA firmado por ambas partes y W-9
-- firmado; un 1099 anterior a la app, solo en los jobsites donde ya estaba.
create function ica_can_work(p_profile uuid, p_jobsite uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select worker_type is distinct from '1099' from profiles where id = p_profile), true)
      or (ica_is_signed(p_profile) and w9_is_signed(p_profile))
      or exists (select 1 from contractor_ica_legacy where profile_id = p_profile and jobsite_id = p_jobsite)
$$;

create function ica_check(p_profile uuid, p_jobsite uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not ica_can_work(p_profile, p_jobsite) then
    raise exception 'ica_required:%', (select full_name from profiles where id = p_profile) using errcode = '22023';
  end if;
end $$;

-- Asignación nueva a un jobsite.
create function jobsite_assignments_ica() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform ica_check(new.profile_id, new.jobsite_id);
  return new;
end $$;
create trigger jobsite_assignments_ica before insert on jobsite_assignments for each row execute function jobsite_assignments_ica();

-- Persona en una visita: si ya está asignada a ese jobsite (la asignación ya pasó la regla), no se frena.
create function visit_staff_ica() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_jobsite uuid;
begin
  select jobsite_id into v_jobsite from visits where id = new.visit_id;
  if not exists (select 1 from jobsite_assignments where profile_id = new.profile_id and jobsite_id = v_jobsite) then
    perform ica_check(new.profile_id, v_jobsite);
  end if;
  return new;
end $$;
create trigger visit_staff_ica before insert on visit_staff for each row execute function visit_staff_ica();

-- Día de servicio nuevo: si estaba programado en la visita o asignado al jobsite, no se frena.
create function service_days_ica() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_jobsite uuid;
begin
  select jobsite_id into v_jobsite from visits where id = new.visit_id;
  if not exists (select 1 from visit_staff where visit_id = new.visit_id and profile_id = new.profile_id)
     and not exists (select 1 from jobsite_assignments where profile_id = new.profile_id and jobsite_id = v_jobsite) then
    perform ica_check(new.profile_id, v_jobsite);
  end if;
  return new;
end $$;
create trigger service_days_ica before insert on service_days for each row execute function service_days_ica();

-- Los 1099 que ya trabajan hoy: "ICA pendiente (anterior a la app)" en los jobsites donde estaban asignados o
-- programados.
insert into contractor_ica_legacy (profile_id, jobsite_id)
select distinct x.profile_id, x.jobsite_id from (
  select a.profile_id, a.jobsite_id from jobsite_assignments a
  union
  select s.profile_id, v.jobsite_id from visit_staff s join visits v on v.id = s.visit_id
  union
  select d.profile_id, v.jobsite_id from service_days d join visits v on v.id = d.visit_id
) x join profiles p on p.id = x.profile_id
 where p.worker_type = '1099' and p.active
on conflict do nothing;

insert into change_log (actor_id, action, entity, entity_id, detail)
select null, 'ica_pendiente_anterior', 'profiles', l.profile_id,
       jsonb_build_object('name', p.full_name, 'jobsites', count(*))
  from contractor_ica_legacy l join profiles p on p.id = l.profile_id
 group by l.profile_id, p.full_name;

-- Lo que ven las pantallas: estado del ICA y del W-9 de un perfil (ficha del perfil). Quien ve empleados; las acciones
-- son del Super Admin (ica-admin).
create function ica_info(p_profile uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p profiles; c contractor_agreements; v_state text;
begin
  if not (is_super_admin() or has_permission('empleados_ver') or current_profile_id() = p_profile) then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;
  select * into p from profiles where id = p_profile;
  if p.id is null then return null; end if;
  select * into c from contractor_agreements where profile_id = p.id and status <> 'void' order by number desc limit 1;
  v_state := case
    when p.worker_type is distinct from '1099' then 'not_required'
    when c.status = 'signed' then 'signed'
    when c.status is not null then c.status
    when exists (select 1 from contractor_ica_legacy where profile_id = p.id) then 'legacy_pending'
    else 'missing' end;
  return jsonb_build_object(
    'profile_id', p.id, 'name', p.full_name, 'worker_type', p.worker_type, 'state', v_state,
    'w9_signed', w9_is_signed(p.id), 'can_be_assigned', p.worker_type is distinct from '1099' or (ica_is_signed(p.id) and w9_is_signed(p.id)),
    'legacy_jobsites', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'name', j.name) order by j.name), '[]'::jsonb)
                          from contractor_ica_legacy l join jobsites j on j.id = l.jobsite_id where l.profile_id = p.id),
    'can_manage', is_super_admin(),
    'agreement', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'ica', contract_label('ICA', c.number), 'status', c.status, 'source', c.source, 'email', c.email,
      'sent_at', c.sent_at, 'expires_at', c.expires_at, 'contractor_signed_at', c.contractor_signed_at,
      'contractor_signer_name', c.contractor_signer_name, 'cc_signed_at', c.cc_signed_at, 'uploaded_at', c.uploaded_at,
      'uploaded_by', (select full_name from profiles where id = c.uploaded_by)) end);
end $$;

-- Funciones del Super Admin (con su JWT, por la Edge Function ica-admin) -------------------------------------------

create function ica_prepare(p_profile uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p profiles; c contractor_agreements;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin prepara el ICA' using errcode = '42501'; end if;
  select * into p from profiles where id = p_profile for update;
  if p.id is null then raise exception 'El perfil no existe' using errcode = 'P0002'; end if;
  select * into c from contractor_agreements where profile_id = p.id and status <> 'void' order by number desc limit 1;
  if c.id is not null then return ica_json(c); end if;
  if p.worker_type is distinct from '1099' or not p.active then
    raise exception 'Solo los contratistas 1099 activos tienen ICA' using errcode = '22023';
  end if;
  insert into contractor_agreements (profile_id, fields, created_by)
  values (p.id, ica_default_fields(p.id), current_profile_id()) returning * into c;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'ica_preparado', 'profiles', p.id,
          jsonb_build_object('name', p.full_name, 'ica', contract_label('ICA', c.number)));
  return ica_json(c);
end $$;

create function ica_save_fields(p_agreement uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements; k text;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin prepara el ICA' using errcode = '42501'; end if;
  select * into c from contractor_agreements where id = p_agreement for update;
  if c.id is null then raise exception 'El ICA no existe' using errcode = 'P0002'; end if;
  if c.status not in ('draft', 'sent') then raise exception 'El ICA ya no se edita' using errcode = '22023'; end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then raise exception 'Campos no válidos' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_fields) loop
    if not (k = any (ica_editable_keys())) or jsonb_typeof(p_fields->k) <> 'string' or length(p_fields->>k) > 500 then
      raise exception 'Campo no válido: %', k using errcode = '22023';
    end if;
  end loop;
  update contractor_agreements
     set fields = c.fields || (select jsonb_object_agg(key, btrim(value)) from jsonb_each_text(p_fields)),
         status = 'draft', token_hash = null, unsigned_path = null, unsigned_sha256 = null
   where id = c.id returning * into c;
  return ica_json(c);
end $$;

create function ica_send_prepare(p_agreement uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin envía el ICA' using errcode = '42501'; end if;
  select * into c from contractor_agreements where id = p_agreement;
  if c.id is null then raise exception 'El ICA no existe' using errcode = 'P0002'; end if;
  if c.status not in ('draft', 'sent') then raise exception 'El ICA no se puede enviar' using errcode = '22023'; end if;
  if cardinality(ica_missing_fields(c.fields)) > 0 then
    raise exception 'missing_fields:%', array_to_string(ica_missing_fields(c.fields), ',') using errcode = '22023';
  end if;
  return ica_json(c);
end $$;

create function ica_send_confirm(p_agreement uuid, p_path text, p_sha256 text, p_token_hash text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements; e text := lower(btrim(coalesce(p_email, '')));
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin envía el ICA' using errcode = '42501'; end if;
  select * into c from contractor_agreements where id = p_agreement for update;
  if c.id is null or c.status not in ('draft', 'sent') then raise exception 'El ICA no se puede enviar' using errcode = '22023'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(e) > 200 then raise exception 'Correo no válido' using errcode = '22023'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_path !~ ('^' || c.profile_id || '/ica-draft/[A-Za-z0-9_.-]+\.pdf$') then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  update contractor_agreements
     set status = 'sent', unsigned_path = p_path, unsigned_sha256 = p_sha256, token_hash = p_token_hash, email = e,
         sent_by = current_profile_id(), sent_at = now(), expires_at = now() + interval '15 days', viewed_at = null
   where id = c.id returning * into c;
  delete from ica_portal_sessions where agreement_id = c.id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'ica_enviado', 'profiles', c.profile_id,
          jsonb_build_object('ica', contract_label('ICA', c.number), 'email', e));
  return ica_json(c);
end $$;

create function ica_countersign_prepare(p_agreement uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin contrafirma' using errcode = '42501'; end if;
  select * into c from contractor_agreements where id = p_agreement;
  if c.id is null then raise exception 'El ICA no existe' using errcode = 'P0002'; end if;
  if c.status <> 'contractor_signed' then raise exception 'Falta la firma del contratista' using errcode = '22023'; end if;
  return ica_json(c) || jsonb_build_object(
    'cc_name', (select full_name from profiles where id = current_profile_id()),
    'cc_email', (select email from profiles where id = current_profile_id()),
    'sent_by_name', (select full_name from profiles where id = c.sent_by));
end $$;

create function ica_countersign_confirm(p_agreement uuid, p_path text, p_sha256 text, p_signature_id uuid,
                                        p_signed_at timestamptz, p_ip text, p_user_agent text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements; me uuid := current_profile_id();
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin contrafirma' using errcode = '42501'; end if;
  select * into c from contractor_agreements where id = p_agreement for update;
  if c.id is null or c.status <> 'contractor_signed' then raise exception 'Falta la firma del contratista' using errcode = '22023'; end if;
  if p_path !~ ('^' || c.profile_id || '/ica/[A-Za-z0-9_.-]+\.pdf$') or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  update contractor_agreements
     set status = 'signed', cc_signer_id = me, cc_signer_name = (select full_name from profiles where id = me),
         cc_signer_title = coalesce(nullif(btrim(fields->>'cc_title'), ''), 'Managing Member'), cc_signed_at = coalesce(p_signed_at, now()),
         cc_ip = left(p_ip, 100), cc_user_agent = left(p_user_agent, 400), cc_signature_id = p_signature_id,
         signed_path = p_path, signed_sha256 = p_sha256, token_hash = null
   where id = c.id returning * into c;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me, 'ica_firmado', 'profiles', c.profile_id, jsonb_build_object('ica', contract_label('ICA', c.number)));
  return ica_json(c) || jsonb_build_object('cc_email', (select email from profiles where id = me));
end $$;

-- ICA firmado en papel subido por el Super Admin: anula el que estuviera abierto y queda "Firmado por ambas partes".
create function ica_upload_paper(p_profile uuid, p_path text, p_sha256 text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p profiles; c contractor_agreements; me uuid := current_profile_id();
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin sube el ICA' using errcode = '42501'; end if;
  select * into p from profiles where id = p_profile for update;
  if p.id is null then raise exception 'El perfil no existe' using errcode = 'P0002'; end if;
  if p.worker_type is distinct from '1099' then raise exception 'Solo los contratistas 1099 tienen ICA' using errcode = '22023'; end if;
  if p_path !~ ('^' || p.id || '/ica/[A-Za-z0-9_.-]+\.(pdf|jpg|png|heic|webp)$') or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  update contractor_agreements set status = 'void', token_hash = null where profile_id = p.id and status <> 'void';
  insert into contractor_agreements (profile_id, source, status, fields, signed_path, signed_sha256, uploaded_by, uploaded_at, created_by)
  values (p.id, 'paper', 'signed', ica_default_fields(p.id), p_path, p_sha256, me, now(), me) returning * into c;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me, 'ica_subido', 'profiles', p.id, jsonb_build_object('name', p.full_name, 'ica', contract_label('ICA', c.number)));
  return ica_json(c);
end $$;

-- Abrir el ICA firmado (solo el Super Admin); cada apertura queda en el historial.
create function ica_open(p_agreement uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin abre el ICA' using errcode = '42501'; end if;
  select * into c from contractor_agreements where id = p_agreement;
  if c.id is null or c.signed_path is null then raise exception 'El ICA no está firmado' using errcode = 'P0002'; end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'ica_abierto', 'profiles', c.profile_id, jsonb_build_object('ica', contract_label('ICA', c.number)));
  return c.signed_path;
end $$;

-- Funciones del portal de firma (solo la Edge Function ica-portal, con la service role) ----------------------------

create function ica_portal_state(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements;
begin
  select * into c from contractor_agreements where token_hash = p_token_hash;
  if c.id is null then return jsonb_build_object('state', 'not_found'); end if;
  return jsonb_build_object('state', case when c.status in ('contractor_signed', 'signed') then 'signed'
                                          when c.status <> 'sent' then 'closed'
                                          when c.expires_at <= now() then 'expired' else 'open' end);
end $$;

create function ica_portal_request_code(p_token_hash text, p_email text, p_code_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements; e text := lower(btrim(coalesce(p_email, '')));
begin
  select * into c from contractor_agreements where token_hash = p_token_hash for update;
  if c.id is null or c.status <> 'sent' or c.expires_at <= now() then return 'closed'; end if;
  if e <> c.email then return 'not_recipient'; end if;
  if (select count(*) from ica_portal_codes where agreement_id = c.id and email = e and created_at > now() - interval '1 hour') >= 5 then
    return 'rate_limited';
  end if;
  insert into ica_portal_codes (agreement_id, email, code_hash, expires_at) values (c.id, e, p_code_hash, now() + interval '10 minutes');
  return 'sent';
end $$;

create function ica_portal_verify_code(p_token_hash text, p_email text, p_code_hash text, p_session_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements; k ica_portal_codes; e text := lower(btrim(coalesce(p_email, '')));
begin
  select * into c from contractor_agreements where token_hash = p_token_hash for update;
  if c.id is null or c.status <> 'sent' or c.expires_at <= now() then return 'closed'; end if;
  select * into k from ica_portal_codes where agreement_id = c.id and email = e order by seq desc limit 1 for update;
  if k.id is null or k.used_at is not null then return 'expired'; end if;
  if k.attempts >= 5 then return 'locked'; end if;
  if k.expires_at <= now() then return 'expired'; end if;
  if k.code_hash <> p_code_hash then
    update ica_portal_codes set attempts = attempts + 1 where id = k.id;
    return case when k.attempts + 1 >= 5 then 'locked' else 'wrong' end;
  end if;
  update ica_portal_codes set used_at = now() where id = k.id;
  insert into ica_portal_sessions (token_hash, agreement_id, email, expires_at)
  values (p_session_hash, c.id, e, least(now() + interval '2 hours', c.expires_at));
  if c.viewed_at is null then update contractor_agreements set viewed_at = now() where id = c.id; end if;
  return 'ok';
end $$;

create function ica_portal_data(p_session_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ses ica_portal_sessions; c contractor_agreements;
begin
  select * into ses from ica_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then return null; end if;
  select * into c from contractor_agreements where id = ses.agreement_id;
  return jsonb_build_object(
    'status', c.status, 'ica', contract_label('ICA', c.number), 'template_version', c.template_version,
    'contractor', c.fields->>'contractor_name', 'business_name', c.fields->>'business_name', 'email', ses.email,
    'expires_at', c.expires_at, 'unsigned_path', c.unsigned_path,
    'signed', case when c.contractor_signed_at is null then null
                   else jsonb_build_object('name', c.contractor_signer_name, 'at', c.contractor_signed_at) end);
end $$;

-- Firma del contratista: nombre y consentimiento; queda "Firmado por el contratista" (falta la contrafirma). El link
-- deja de servir (un solo uso).
create function ica_portal_sign(p_session_hash text, p_name text, p_consent boolean, p_ip text, p_user_agent text,
                                p_signature_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ses ica_portal_sessions; c contractor_agreements; n text := btrim(coalesce(p_name, ''));
begin
  select * into ses from ica_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then raise exception 'Sesión vencida' using errcode = '42501'; end if;
  select * into c from contractor_agreements where id = ses.agreement_id for update;
  if c.status <> 'sent' or c.expires_at <= now() then raise exception 'El ICA ya no se puede firmar' using errcode = '22023'; end if;
  if n = '' or length(n) > 120 or not coalesce(p_consent, false) then
    raise exception 'Faltan datos para firmar' using errcode = '22023';
  end if;
  update contractor_agreements
     set status = 'contractor_signed', contractor_signer_name = n, contractor_signer_email = ses.email,
         contractor_signed_at = now(), contractor_ip = left(p_ip, 100), contractor_user_agent = left(p_user_agent, 400),
         contractor_consent = true, contractor_signature_id = coalesce(p_signature_id, gen_random_uuid()), token_hash = null
   where id = c.id returning * into c;
  delete from ica_portal_sessions where agreement_id = c.id and token_hash <> p_session_hash;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (null, 'ica_firmado_contratista', 'profiles', c.profile_id, jsonb_build_object('ica', contract_label('ICA', c.number), 'name', n));
  return jsonb_build_object('signed_at', c.contractor_signed_at, 'ica', contract_label('ICA', c.number),
    'contractor', (select full_name from profiles where id = c.profile_id), 'sent_by_email', (select email from profiles where id = c.sent_by));
end $$;

-- Restaura el texto del aviso service_day_returned (20261030000006), que la 20261030000008 dejó fuera al reemplazar
-- notification_text.
do $$
declare
  src text;
begin
  select pg_get_functiondef('notification_text'::regproc) into src;
  if src like '%service_day_returned%' then return; end if;
  src := replace(src, '    when ''work_approved'' then',
    '    when ''service_day_returned'' then
      title := case when es then ''Día de servicio: requiere corrección'' else ''Service day: needs correction'' end;
      detail := concat_ws('' · '', d->>''jobsite'', day);
    when ''work_approved'' then');
  if src not like '%service_day_returned%' then raise exception 'notification_text no se pudo actualizar'; end if;
  execute src;
end $$;

-- Permisos de ejecución.
revoke execute on function ica_editable_keys(), ica_required_keys(), ica_missing_fields(jsonb), ica_entity_text(jsonb),
  ica_default_fields(uuid), ica_json(contractor_agreements), w9_is_signed(uuid), ica_is_signed(uuid), ica_can_work(uuid, uuid),
  ica_check(uuid, uuid), jobsite_assignments_ica(), visit_staff_ica(), service_days_ica(), ica_info(uuid),
  ica_prepare(uuid), ica_save_fields(uuid, jsonb), ica_send_prepare(uuid), ica_send_confirm(uuid, text, text, text, text),
  ica_countersign_prepare(uuid), ica_countersign_confirm(uuid, text, text, uuid, timestamptz, text, text),
  ica_upload_paper(uuid, text, text), ica_open(uuid),
  ica_portal_state(text), ica_portal_request_code(text, text, text), ica_portal_verify_code(text, text, text, text),
  ica_portal_data(text), ica_portal_sign(text, text, boolean, text, text, uuid)
  from public, anon, authenticated;
grant execute on function ica_info(uuid), ica_prepare(uuid), ica_save_fields(uuid, jsonb), ica_send_prepare(uuid),
  ica_send_confirm(uuid, text, text, text, text), ica_countersign_prepare(uuid),
  ica_countersign_confirm(uuid, text, text, uuid, timestamptz, text, text), ica_upload_paper(uuid, text, text), ica_open(uuid)
  to authenticated;
grant execute on function ica_portal_state(text), ica_portal_request_code(text, text, text),
  ica_portal_verify_code(text, text, text, text), ica_portal_data(text), ica_portal_sign(text, text, boolean, text, text, uuid)
  to service_role;
