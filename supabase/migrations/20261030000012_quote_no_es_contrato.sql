-- Orden 61 (legal rev. 3, fase C, D-283): aceptar el quote no es contrato; vigencia de 30 días; estados del contrato
-- del jobsite; el Schedule y la asignación de personal esperan "Firmado por ambas partes"; tipo de limpieza
-- (residencial sin el 6 %); la aceptación registra el navegador, la versión de los Client Portal Terms (1.0) y el
-- texto exacto de la casilla de rev. 3 (legal/rev3/2_Client_Portal_Terms_EN.pdf).
-- Fuente: decisions.md D-283 (reemplaza en parte D-045), D-209, D-237, D-238, D-239; legal/rev3/cambios_app_rev3.pdf
-- (tareas 11 y 12).
--
-- MIGRACIÓN DE DATOS (anotada, D-283): los jobsites que ya existen quedan "Firmado por ambas partes" para no frenar la
-- operación actual. Un jobsite de un Cliente previo a la app (D-210) que se dé de alta después también nace firmado:
-- su contrato está fuera de la app (decidido por el ejecutor, a confirmar por el dueño).

-- 1. Tipo de limpieza (D-283) -------------------------------------------------------------------------------------
alter table leads add column cleaning_type text not null default 'non_residential'
  check (cleaning_type in ('non_residential', 'residential'));
alter table jobsites add column cleaning_type text not null default 'non_residential'
  check (cleaning_type in ('non_residential', 'residential'));

-- Número del quote (Q-0001), que piden la casilla de rev. 3 y el contrato. Los existentes, por orden de creación.
create sequence quote_number_seq;
alter table quotes add column number bigint;
update quotes q set number = x.n
  from (select id, row_number() over (order by created_at, id) n from quotes) x where x.id = q.id;
select setval('quote_number_seq', coalesce((select max(number) from quotes), 0) + 1, false);
alter table quotes alter column number set default nextval('quote_number_seq');
alter table quotes alter column number set not null;
alter table quotes add constraint quotes_number_unique unique (number);
alter sequence quote_number_seq owned by quotes.number;

create function quote_number_label(p_number bigint) returns text
language sql immutable as $$ select 'Q-' || lpad(p_number::text, 4, '0') $$;

-- ¿El quote es de limpieza residencial? El del sitio, por el lead; el extra, por su jobsite.
create function quote_is_residential(p_quote uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when q.kind = 'extra' then j.cleaning_type else l.cleaning_type end = 'residential'
                     from quotes q left join leads l on l.id = q.lead_id left join jobsites j on j.id = q.jobsite_id
                    where q.id = p_quote), false)
$$;

-- Renglones sin gravable: todas las líneas de servicios y add-ons con taxable = false.
create function quote_lines_no_tax(p jsonb) returns jsonb
language sql immutable as $$
  select p || jsonb_build_object(
    'services', coalesce((select jsonb_agg(x || '{"taxable": false}'::jsonb) from jsonb_array_elements(coalesce(p->'services', '[]'::jsonb)) x), '[]'::jsonb),
    'addons', coalesce((select jsonb_agg(x || '{"taxable": false}'::jsonb) from jsonb_array_elements(coalesce(p->'addons', '[]'::jsonb)) x), '[]'::jsonb))
$$;

-- El servidor fuerza "sin impuesto" en los borradores residenciales aunque una línea venga marcada como gravable.
create function quote_versions_residential() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  if new.status = 'draft' and quote_is_residential(new.quote_id) then
    new.lines := quote_lines_no_tax(new.lines);
    select * into t from quote_totals(new.lines, new.tax_rate);
    new.subtotal := t.subtotal;
    new.discount := t.discount;
    new.tax := t.tax;
    new.total := t.total;
  end if;
  return new;
end $$;
create trigger quote_versions_residential before insert or update on quote_versions
  for each row execute function quote_versions_residential();

-- Cambiar el tipo: lead (Ventas) y jobsite (Clientes). Los borradores abiertos se recalculan.
create function set_lead_cleaning_type(p_lead uuid, p_type text) returns void
language plpgsql security definer set search_path = public as $$
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
  update leads set cleaning_type = p_type where id = p_lead;
  -- Al volver a no residencial las líneas quedan sin gravable: se marcan otra vez a mano (como hoy).
  update quote_versions v set lines = v.lines
    from quotes q where q.id = v.quote_id and q.lead_id = p_lead and v.status = 'draft';
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'tipo_limpieza_cambiado', 'leads', p_lead,
          jsonb_build_object('company', l.company, 'antes', l.cleaning_type, 'despues', p_type));
end $$;

create function set_jobsite_cleaning_type(p_jobsite uuid, p_type text) returns void
language plpgsql security definer set search_path = public as $$
declare
  j jobsites;
begin
  if not has_permission('clientes_editar_datos') then
    raise exception 'No tienes permiso para editar clientes' using errcode = '42501';
  end if;
  if p_type is null or p_type not in ('non_residential', 'residential') then
    raise exception 'Tipo no válido' using errcode = '22023';
  end if;
  select * into j from jobsites where id = p_jobsite for update;
  if j.id is null then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
  if j.cleaning_type = p_type then return; end if;
  update jobsites set cleaning_type = p_type where id = p_jobsite;
  update quote_versions v set lines = v.lines
    from quotes q where q.id = v.quote_id and q.jobsite_id = p_jobsite and v.status = 'draft';
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'tipo_limpieza_cambiado', 'jobsites', p_jobsite,
          jsonb_build_object('name', j.name, 'antes', j.cleaning_type, 'despues', p_type));
end $$;

-- 2. Vigencia: 30 días desde el envío (D-283) -------------------------------------------------------------------
-- Los borradores con más de 30 días de vigencia bajan a 30; los ya enviados vencen a los 30 días del envío.
update quote_versions set valid_days = 30 where status = 'draft' and valid_days > 30;

create or replace function expire_quotes() returns void
language sql security definer set search_path = public as $$
  update quote_versions set status = 'expired'
   where status in ('sent', 'viewed')
     and ((expires_at is not null and expires_at <= now()) or (sent_at is not null and sent_at + interval '30 days' <= now()));
$$;

-- Hasta cuándo se puede aceptar una versión enviada.
create function quote_accept_until(v quote_versions) returns timestamptz
language sql immutable as $$
  select case when v.sent_at is null then null
              else least(coalesce(v.expires_at, v.sent_at + interval '30 days'), v.sent_at + interval '30 days') end
$$;

-- 3. Estado del contrato del jobsite (D-283) ----------------------------------------------------------------------
-- pending = "Quote aceptado – contrato pendiente"; client_signed = "Firmado por el cliente" (falta la contrafirma);
-- both_signed = "Firmado por ambas partes" (contrato vigente); needs_update = "Requiere actualización" (pasaron 15
-- días desde la aceptación sin la firma del cliente).
create type contract_state as enum ('pending', 'client_signed', 'both_signed', 'needs_update');
alter table jobsites add column contract_status contract_state not null default 'pending';
alter table jobsites add column contract_accepted_at timestamptz; -- desde aquí corren los 15 días
alter table jobsites add column contract_signed_at timestamptz;   -- "Firmado por ambas partes"
update jobsites set contract_status = 'both_signed'; -- migración de datos, ver arriba

-- Cliente previo a la app (D-210): su jobsite nace firmado.
create function jobsites_contract_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from clients where id = new.client_id and legacy) then
    new.contract_status := 'both_signed';
  end if;
  return new;
end $$;
create trigger jobsites_contract_default before insert on jobsites
  for each row execute function jobsites_contract_default();

create function jobsite_contract_ready(p_jobsite uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select contract_status = 'both_signed' from jobsites where id = p_jobsite), false)
$$;

-- "Requiere actualización": 15 días desde la aceptación sin la firma del cliente. Corre a diario (cron) y al consultar.
create function jobsite_contracts_expire() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with x as (
    update jobsites set contract_status = 'needs_update'
     where contract_status = 'pending' and contract_accepted_at is not null
       and contract_accepted_at + interval '15 days' <= now()
    returning id, name)
  insert into change_log (actor_id, action, entity, entity_id, detail)
  select null, 'contrato_requiere_actualizacion', 'jobsites', x.id, jsonb_build_object('name', x.name) from x;
  get diagnostics n = row_count;
  return n;
end $$;
select cron.schedule('cidclean-contratos-vencidos', '40 9 * * *', $$select public.jobsite_contracts_expire()$$);

-- Estado del contrato de una versión aceptada del quote del sitio (null si no aplica).
create function quote_contract_status(p_version uuid) returns text
language sql stable security definer set search_path = public as $$
  select j.contract_status::text
    from quote_versions v join quotes q on q.id = v.quote_id join jobsites j on j.site_id = q.site_id
   where v.id = p_version and v.status = 'accepted' and q.kind = 'site'
$$;

-- El quote necesita una versión nueva porque venció el plazo para firmar el contrato.
create function quote_needs_update(p_quote uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from quotes q join jobsites j on j.site_id = q.site_id
                  where q.id = p_quote and q.kind = 'site' and j.contract_status = 'needs_update')
$$;

-- Bloqueo del Schedule y de la asignación de personal mientras no esté "Firmado por ambas partes".
create function contract_guard_visits() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and not new.removed) or (tg_op = 'UPDATE' and old.removed and not new.removed) then
    if not jobsite_contract_ready(new.jobsite_id) then
      raise exception 'contract_pending:%', (select name from jobsites where id = new.jobsite_id) using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger visits_contract_guard before insert or update on visits
  for each row execute function contract_guard_visits();

create function contract_guard_visit_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_jobsite uuid := (select jobsite_id from visits where id = new.visit_id);
begin
  if not jobsite_contract_ready(v_jobsite) then
    raise exception 'contract_pending:%', (select name from jobsites where id = v_jobsite) using errcode = '22023';
  end if;
  return new;
end $$;
create trigger visit_staff_contract_guard before insert on visit_staff
  for each row execute function contract_guard_visit_staff();

create function contract_guard_assignments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not jobsite_contract_ready(new.jobsite_id) then
    raise exception 'contract_pending:%', (select name from jobsites where id = new.jobsite_id) using errcode = '22023';
  end if;
  return new;
end $$;
create trigger jobsite_assignments_contract_guard before insert on jobsite_assignments
  for each row execute function contract_guard_assignments();

-- 4. Aceptación en el portal (D-283) -------------------------------------------------------------------------------
alter table quote_decisions add column portal_terms_version text;  -- "1.0"
alter table quote_decisions add column acceptance_text text;       -- texto exacto de la casilla aceptada
alter table quote_decisions add column copy_sent_at timestamptz;   -- copia de la aceptación enviada al cliente

-- Texto de la casilla de rev. 3 (legal/rev3/2_Client_Portal_Terms_EN.pdf, al final), solo para el quote del sitio.
-- El quote de un extra (D-238, D-239) conserva sus textos.
create function quote_acceptance_text(p_version uuid) returns text
language sql stable security definer set search_path = public as $$
  select format('I have read the Scope of Work and accept quote %s version %s and these Client Portal Terms version 1.0. '
                'I understand this acceptance is not a contract and that services begin only after both parties sign '
                'the Commercial Service Agreement. I am authorized to accept on behalf of %s.',
                quote_number_label(q.number), quote_version_label(v.minor), coalesce(v.snapshot->>'company', l.company))
    from quote_versions v join quotes q on q.id = v.quote_id left join leads l on l.id = q.lead_id
   where v.id = p_version and q.kind = 'site'
$$;

-- Datos de la copia de la aceptación que se manda al cliente (D-283).
create function quote_acceptance_copy(p_version uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'client_email', d.email, 'signer_name', d.signer_name, 'signer_title', d.signer_title, 'accepted_at', d.created_at,
    'acceptance_text', d.acceptance_text, 'portal_terms_version', d.portal_terms_version, 'ip', d.ip, 'user_agent', d.user_agent,
    'quote_number', quote_number_label(q.number), 'address', v.snapshot->>'address', 'pdf_path', v.pdf_path,
    'total', v.total, 'decision_id', d.id)
    from quote_decisions d join quote_versions v on v.id = d.version_id join quotes q on q.id = v.quote_id
   where d.version_id = p_version and d.kind = 'accepted'
$$;

create function portal_mark_acceptance_copy(p_decision uuid) returns void
language sql security definer set search_path = public as $$
  update quote_decisions set copy_sent_at = now() where id = p_decision;
$$;

-- Funciones que cambian (D-283) ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_decide(p_session_hash text, p_kind text, p_name text, p_title text, p_reason uuid, p_note text, p_read_confirmed boolean, p_ip text, p_user_agent text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ses quote_portal_sessions;
  v quote_versions;
  q quotes;
  l leads;
  s lead_sites;
  wv walkthrough_versions;
  j jobsites;
  v_client uuid;
  v_jobsite uuid;
  v_terms uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_open int;
  v_month date;
  v_company text;
  v_site text;
begin
  perform expire_quotes();
  select * into ses from quote_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then raise exception 'Sesión vencida' using errcode = '42501'; end if;
  select * into v from quote_versions where id = ses.version_id for update;
  if v.status not in ('sent', 'viewed') then raise exception 'El quote ya no está abierto' using errcode = '22023'; end if;
  if p_kind not in ('accepted', 'rejected', 'changes_requested') then raise exception 'Decisión no válida' using errcode = '22023'; end if;
  if v_note is not null and length(v_note) > 2000 then raise exception 'Nota muy larga' using errcode = '22023'; end if;
  if p_reason is not null and not exists (select 1 from lost_reasons where id = p_reason and active) then
    raise exception 'Motivo no válido' using errcode = '22023';
  end if;
  if p_kind = 'accepted' then
    -- D-283: solo dentro de los 30 días desde el envío (además de expire_quotes).
    if quote_accept_until(v) is null or now() >= quote_accept_until(v) then
      raise exception 'El quote venció' using errcode = '22023';
    end if;
    -- D-239: sin SOW (quote de extra) no hay nada que abrir.
    if v.sow_path is not null and ses.sow_opened_at is null then raise exception 'Abre el SOW para poder continuar' using errcode = '22023'; end if;
    if not coalesce(p_read_confirmed, false) or btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_title, '')) = ''
       or length(p_name) > 120 or length(p_title) > 120 then
      raise exception 'Faltan datos para aceptar' using errcode = '22023';
    end if;
  elsif p_kind = 'rejected' and p_reason is null then
    raise exception 'Falta el motivo' using errcode = '22023';
  elsif p_kind = 'changes_requested' and p_reason is null and v_note is null then
    raise exception 'Falta el motivo o la nota' using errcode = '22023';
  end if;

  select id into v_terms from terms_documents where kind = 'portal' order by version desc limit 1;
  insert into quote_decisions (version_id, kind, email, signer_name, signer_title, reason_id, note, sow_read_at,
                               read_confirmed, terms_document_id, ip, user_agent,
                               portal_terms_version, acceptance_text)
  values (v.id, p_kind, ses.email, nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_title, '')), ''),
          p_reason, v_note, ses.sow_opened_at, coalesce(p_read_confirmed, false),
          case when p_kind = 'accepted' then v_terms end, left(p_ip, 100), left(p_user_agent, 400),
          case when p_kind = 'accepted' and quote_acceptance_text(v.id) is not null then '1.0' end,
          case when p_kind = 'accepted' then quote_acceptance_text(v.id) end);
  update quote_versions set status = p_kind::quote_status, decided_at = now() where id = v.id;

  select * into q from quotes where id = v.quote_id;

  if q.kind = 'extra' then
    select * into j from jobsites where id = q.jobsite_id;
    v_company := (select name from clients where id = j.client_id);
    v_site := j.name;
    if p_kind = 'accepted' then
      v_month := month_start(coalesce(v.service_date, cc_today()));
      insert into income_expected (jobsite_id, month) values (j.id, v_month) on conflict (jobsite_id, month) do nothing;
      insert into income_extras (jobsite_id, month, amount, label, service_date, quote_version_id)
      values (j.id, v_month, v.total,
              coalesce((select string_agg(x->>'label', ', ') from jsonb_array_elements(v.lines->'services') x), 'Extra'),
              v.service_date, v.id);
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'ingreso_extra_agregado', 'jobsites', j.id,
              jsonb_build_object('name', j.name, 'month', v_month, 'amount', v.total, 'version', quote_version_label(v.minor)));
    end if;
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (null, case p_kind when 'accepted' then 'quote_aceptado' when 'rejected' then 'quote_rechazado'
                              else 'quote_cambios_pedidos' end,
            'quotes', q.id, jsonb_build_object('version', quote_version_label(v.minor), 'company', v_company, 'extra', true));
    return jsonb_build_object(
      'kind', p_kind, 'company', v_company, 'site', v_site, 'version', quote_version_label(v.minor), 'lead_id', null,
      'quote_id', q.id, 'jobsite_id', null, 'extra', true, 'extra_jobsite_id', j.id, 'sow_path', v.sow_path,
      'sender_email', (select email from profiles where id = v.sent_by),
      'sender_language', (select language from profiles where id = v.sent_by))
    || case when p_kind = 'accepted' then coalesce(quote_acceptance_copy(v.id), '{}'::jsonb) else '{}'::jsonb end;
  end if;

  select * into l from leads where id = q.lead_id for update;
  select * into s from lead_sites where id = q.site_id;

  if p_kind = 'accepted' then
    -- Nace el Cliente (uno por lead) con este Jobsite (D-209).
    select id into v_client from clients where lead_id = l.id;
    if v_client is null then
      insert into clients (lead_id, name, created_by) values (l.id, l.company, v.sent_by) returning id into v_client;
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'cliente_creado', 'clients', v_client, jsonb_build_object('company', l.company));
    end if;
    select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
    -- D-283: si el sitio ya tiene jobsite (versión nueva tras "Requiere actualización"), se reabre el plazo de 15 días.
    select id into v_jobsite from jobsites where site_id = s.id for update;
    if v_jobsite is null then
      insert into jobsites (client_id, site_id, name, address, contact_name, contact_phone, contact_email, frequency,
                            walkthrough_id, walkthrough_version, created_by, cleaning_type, contract_status, contract_accepted_at)
      values (v_client, s.id, coalesce(nullif(btrim(s.name), ''), s.address),
              coalesce(nullif(btrim(wv.data->'contact'->>'address'), ''), s.address),
              nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(wv.data->'contact'->>'phone'), ''),
              coalesce(nullif(lower(btrim(wv.data->'contact'->>'email')), ''), v.contact_email),
              wv.data->'frequency', q.walkthrough_id, v.walkthrough_version, v.sent_by, l.cleaning_type, 'pending', now())
      returning id into v_jobsite;
      insert into jobsite_rates (jobsite_id, monthly_rate, quote_version_id, set_by) values (v_jobsite, v.total, v.id, v.sent_by);
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'jobsite_creado', 'jobsites', v_jobsite, jsonb_build_object('company', l.company, 'name', s.name));
    else
      update jobsites set contract_status = 'pending', contract_accepted_at = now(), cleaning_type = l.cleaning_type
       where id = v_jobsite;
      update jobsite_rates set monthly_rate = v.total, quote_version_id = v.id, set_by = v.sent_by, set_at = now()
       where jobsite_id = v_jobsite;
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'contrato_pendiente', 'jobsites', v_jobsite, jsonb_build_object('company', l.company, 'name', s.name,
              'version', quote_version_label(v.minor)));
    end if;
    if l.status <> 'won' then
      update leads set status = 'won' where id = l.id;
    end if;
  elsif p_kind = 'changes_requested' then
    if l.status not in ('won', 'lost') then update leads set status = 'negotiation' where id = l.id; end if;
  else
    -- Perdido solo cuando no queda ningún sitio abierto (D-209): todos con su último quote rechazado.
    select count(*) into v_open
      from lead_sites ls
      left join quotes qq on qq.site_id = ls.id
      left join lateral (select status from quote_versions x where x.quote_id = qq.id order by x.minor desc limit 1) lv on true
     where ls.lead_id = l.id and (lv.status is null or lv.status <> 'rejected');
    if v_open = 0 and l.status not in ('won', 'lost') then
      update leads set status = 'lost', lost_reason_id = p_reason, lost_note = v_note where id = l.id;
    end if;
  end if;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (null, case p_kind when 'accepted' then 'quote_aceptado' when 'rejected' then 'quote_rechazado'
                            else 'quote_cambios_pedidos' end,
          'quotes', q.id, jsonb_build_object('version', quote_version_label(v.minor), 'company', l.company));

  return jsonb_build_object(
    'kind', p_kind, 'company', l.company, 'site', coalesce(nullif(btrim(s.name), ''), s.address),
    'version', quote_version_label(v.minor), 'lead_id', l.id, 'quote_id', q.id, 'jobsite_id', v_jobsite, 'extra', false,
    'sow_path', v.sow_path,
    'sender_email', (select email from profiles where id = v.sent_by),
    'sender_language', (select language from profiles where id = v.sent_by))
    || case when p_kind = 'accepted' then coalesce(quote_acceptance_copy(v.id), '{}'::jsonb) else '{}'::jsonb end;
end $function$;

CREATE OR REPLACE FUNCTION public.portal_quote(p_session_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ses quote_portal_sessions;
  v quote_versions;
  t terms_documents;
begin
  perform expire_quotes();
  select * into ses from quote_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then return null; end if;
  select * into v from quote_versions where id = ses.version_id;
  select * into t from terms_documents where kind = 'portal' order by version desc limit 1;
  return jsonb_build_object(
    'status', v.status, 'version', quote_version_label(v.minor), 'language', v.snapshot->>'language',
    'company', v.snapshot->>'company', 'site', v.snapshot->>'site', 'address', v.snapshot->>'address',
    'frequency', v.snapshot->'frequency', 'lines', v.lines, 'tax_rate', v.tax_rate,
    'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total,
    'extra', (select kind = 'extra' from quotes where id = v.quote_id), 'service_date', v.service_date,
    'sent_at', v.sent_at, 'expires_at', v.expires_at, 'sow_opened', ses.sow_opened_at is not null,
    'terms_version', t.version,
    'quote_number', (select quote_number_label(number) from quotes where id = v.quote_id),
    'acceptance_text', quote_acceptance_text(v.id), 'portal_terms_version', '1.0', 'accept_until', quote_accept_until(v),
    'contract_status', quote_contract_status(v.id),
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id,
                  'label', case when v.snapshot->>'language' = 'es' then r.label_es else r.label_en end) order by r.sort), '[]')
                  from lost_reasons r where r.active),
    'decision', (select jsonb_build_object('kind', d.kind, 'name', d.signer_name, 'at', d.created_at)
                   from quote_decisions d where d.version_id = v.id));
end $function$;

CREATE OR REPLACE FUNCTION public.get_site_quote(p_site uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q quotes;
  prices boolean := has_permission('quotes_ver_precios');
  sow boolean := has_permission('sow_contratos_subir_ver');
  w walkthroughs;
  wv walkthrough_versions;
  res jsonb;
begin
  if not (has_permission('quotes_ver') or has_permission('quotes_editar') or has_permission('quotes_enviar')) then
    raise exception 'No tienes permiso para ver quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  perform jobsite_contracts_expire();
  select * into w from walkthroughs where site_id = p_site;
  select * into wv from walkthrough_versions where walkthrough_id = w.id and version = w.current_version;
  select * into q from quotes where site_id = p_site;
  if q.id is null then
    return jsonb_build_object('quote_id', null, 'walkthrough_closed', coalesce(w.current_version, 0) > 0, 'versions', '[]'::jsonb,
                              'frequency', wv.data->'frequency', 'address', nullif(btrim(wv.data->'contact'->>'address'), ''));
  end if;
  -- Quien ve el quote decidido lo da por visto en el Inicio (D-209: pendiente en el Inicio).
  update quote_versions set decision_seen_at = now()
   where quote_id = q.id and decided_at is not null and decision_seen_at is null;
  select jsonb_build_object(
    'quote_id', q.id, 'quote_number', quote_number_label(q.number),
    'cleaning_type', (select cleaning_type from leads where id = q.lead_id), 'walkthrough_closed', coalesce(w.current_version, 0) > 0,
    'frequency', wv.data->'frequency', 'address', nullif(btrim(wv.data->'contact'->>'address'), ''),
    'versions', coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'version', quote_version_label(v.minor), 'minor', v.minor, 'status', v.status,
      'lines', case when prices then v.lines else (
          select jsonb_build_object(
            'services', coalesce((select jsonb_agg(x - 'amount') from jsonb_array_elements(v.lines->'services') x), '[]'),
            'addons', coalesce((select jsonb_agg(x - 'amount') from jsonb_array_elements(v.lines->'addons') x), '[]'),
            'discounts', coalesce((select jsonb_agg(x - 'value') from jsonb_array_elements(v.lines->'discounts') x), '[]'))) end,
      'tax_rate', v.tax_rate, 'valid_days', v.valid_days,
      'subtotal', case when prices then v.subtotal end, 'discount', case when prices then v.discount end,
      'tax', case when prices then v.tax end, 'total', case when prices then v.total end,
      'contact_email', v.contact_email, 'recipients', to_jsonb(v.recipients),
      'has_sow', v.sow_path is not null, 'sow_path', case when sow then v.sow_path end,
      'pdf_path', case when prices then v.pdf_path end,
      'sent_at', v.sent_at, 'expires_at', v.expires_at, 'viewed_at', v.viewed_at, 'decided_at', v.decided_at, 'contract_status', quote_contract_status(v.id),
      'sent_by', (select full_name from profiles where id = v.sent_by),
      'decision', (select jsonb_build_object('kind', d.kind, 'name', d.signer_name, 'title', d.signer_title,
                     'reason_es', r.label_es, 'reason_en', r.label_en, 'note', d.note, 'at', d.created_at, 'email', d.email)
                     from quote_decisions d left join lost_reasons r on r.id = d.reason_id where d.version_id = v.id)
    ) order by v.minor desc), '[]'::jsonb))
    into res
    from quote_versions v where v.quote_id = q.id;
  return res;
end $function$;

CREATE OR REPLACE FUNCTION public.quote_versions_json(p_quote uuid, prices boolean, sow boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'version', quote_version_label(v.minor), 'minor', v.minor, 'status', v.status,
      'lines', case when prices then v.lines else (
          select jsonb_build_object(
            'services', coalesce((select jsonb_agg(x - 'amount') from jsonb_array_elements(v.lines->'services') x), '[]'),
            'addons', coalesce((select jsonb_agg(x - 'amount') from jsonb_array_elements(v.lines->'addons') x), '[]'),
            'discounts', coalesce((select jsonb_agg(x - 'value') from jsonb_array_elements(v.lines->'discounts') x), '[]'))) end,
      'tax_rate', v.tax_rate, 'valid_days', v.valid_days, 'service_date', v.service_date,
      'subtotal', case when prices then v.subtotal end, 'discount', case when prices then v.discount end,
      'tax', case when prices then v.tax end, 'total', case when prices then v.total end,
      'contact_email', v.contact_email, 'recipients', to_jsonb(v.recipients),
      'has_sow', v.sow_path is not null, 'sow_path', case when sow then v.sow_path end,
      'pdf_path', case when prices then v.pdf_path end,
      'sent_at', v.sent_at, 'expires_at', v.expires_at, 'viewed_at', v.viewed_at, 'decided_at', v.decided_at, 'contract_status', quote_contract_status(v.id),
      'sent_by', (select full_name from profiles where id = v.sent_by),
      'decision', (select jsonb_build_object('kind', d.kind, 'name', d.signer_name, 'title', d.signer_title,
                     'reason_es', r.label_es, 'reason_en', r.label_en, 'note', d.note, 'at', d.created_at, 'email', d.email)
                     from quote_decisions d left join lost_reasons r on r.id = d.reason_id where d.version_id = v.id)
    ) order by v.minor desc), '[]'::jsonb)
    from quote_versions v where v.quote_id = p_quote
$function$;

CREATE OR REPLACE FUNCTION public.new_quote_version(p_quote uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  last quote_versions;
  w walkthroughs;
  v_new uuid;
begin
  if not (has_permission('quotes_editar') and has_permission('quotes_ver_precios')) then
    raise exception 'No tienes permiso para armar quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  perform jobsite_contracts_expire();
  select * into last from quote_versions where quote_id = p_quote order by minor desc limit 1 for update;
  if last.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  -- D-283: un quote aceptado admite versión nueva solo si su contrato pasó a "Requiere actualización".
  if last.status = 'draft' or (last.status = 'accepted' and not quote_needs_update(p_quote)) then
    raise exception 'Este quote no admite una versión nueva' using errcode = '22023';
  end if;
  select wk.* into w from quotes q join walkthroughs wk on wk.id = q.walkthrough_id where q.id = p_quote;
  insert into quote_versions (quote_id, minor, walkthrough_version, lines, tax_rate, valid_days, contact_email,
                              recipients, subtotal, discount, tax, total, sow_path, service_date, created_by)
  values (p_quote, last.minor + 1, coalesce(w.current_version, last.walkthrough_version), last.lines, last.tax_rate, least(last.valid_days, 30),
          last.contact_email, last.recipients, last.subtotal, last.discount, last.tax, last.total, last.sow_path, last.service_date,
          current_profile_id())
  returning id into v_new;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'quote_version_nueva', 'quotes', p_quote,
          jsonb_build_object('version', quote_version_label(last.minor + 1)));
  return v_new;
end $function$;

CREATE OR REPLACE FUNCTION public.save_quote_draft(p_version uuid, p_lines jsonb, p_tax_rate numeric, p_valid_days integer, p_recipients text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v quote_versions;
  t record;
  clean text[];
begin
  if not (has_permission('quotes_editar') and has_permission('quotes_ver_precios')) then
    raise exception 'No tienes permiso para armar quotes' using errcode = '42501';
  end if;
  select * into v from quote_versions where id = p_version for update;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Solo se edita un borrador' using errcode = '22023'; end if;
  if not quote_lines_valid(p_lines) then raise exception 'Renglones no válidos' using errcode = '22023'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'Tax no válido' using errcode = '22023'; end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 30 then raise exception 'Vigencia no válida' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct e), '{}') into clean
    from (select lower(btrim(x)) e from unnest(coalesce(p_recipients, '{}')) x) s where e <> '';
  if exists (select 1 from unnest(clean) e where e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') or cardinality(clean) > 10 then
    raise exception 'Correo no válido' using errcode = '22023';
  end if;
  select * into t from quote_totals(p_lines, p_tax_rate);
  update quote_versions
     set lines = p_lines, tax_rate = p_tax_rate, valid_days = p_valid_days, recipients = clean,
         subtotal = t.subtotal, discount = t.discount, tax = t.tax, total = t.total
   where id = p_version;
end $function$;

CREATE OR REPLACE FUNCTION public.confirm_send_quote(p_version uuid, p_actor uuid, p_pdf_path text, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v quote_versions;
  q quotes;
  v_token text;
  v_expires timestamptz;
begin
  select * into v from quote_versions where id = p_version for update;
  if v.id is null or v.status <> 'draft' then raise exception 'Este quote ya se envió' using errcode = '22023'; end if;
  select * into q from quotes where id = v.quote_id;
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  v_expires := now() + make_interval(days => least(v.valid_days, 30));
  -- Una versión nueva reemplaza a la anterior (D-209).
  update quote_versions set status = 'superseded'
   where quote_id = v.quote_id and id <> v.id and (status in ('sent', 'viewed', 'changes_requested', 'expired')
          or (status = 'accepted' and quote_needs_update(v.quote_id)));
  update quote_versions
     set status = 'sent', sent_at = now(), sent_by = p_actor, expires_at = v_expires, public_token = v_token,
         pdf_path = p_pdf_path, snapshot = p_snapshot
   where id = v.id;
  update leads set status = 'quote_sent'
   where id = q.lead_id and status in ('new', 'contacted', 'walkthrough_scheduled', 'walkthrough_done');
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'quote_enviado', 'quotes', q.id, jsonb_build_object('version', quote_version_label(v.minor)));
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end $function$;

CREATE OR REPLACE FUNCTION public.generate_accounting(p_today date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d date := coalesce(p_today, cc_today());
  j record;
  r recurring_expenses;
  m date;
  v_start date;
  v_floor date;
  v_due date;
  v_id uuid;
  n_income int := 0;
  n_expense int := 0;
begin
  for j in
    select x.id, x.name, x.start_date, x.created_at, x.contract_signed_at, x.status_changed_at, rt.monthly_rate
      from jobsites x join jobsite_rates rt on rt.jobsite_id = x.id
     where x.status = 'active' and x.contract_status = 'both_signed'
  loop
    v_start := coalesce(j.start_date, local_day(coalesce(j.contract_signed_at, j.created_at)));
    v_floor := greatest(month_start(v_start), accounting_floor());
    -- Reactivado después de una pausa: desde el mes en que volvió a activo.
    if j.status_changed_at is not null then v_floor := greatest(v_floor, month_start(local_day(j.status_changed_at))); end if;
    m := v_floor;
    while m <= month_start(d) loop
      v_due := income_due_day(v_start, m);
      if v_due <= d and v_due >= v_start then
        v_id := null;
        insert into income_expected (jobsite_id, month, amount, generated_at)
        values (j.id, m, j.monthly_rate, now())
        on conflict (jobsite_id, month) do update set amount = excluded.amount, generated_at = excluded.generated_at
          where income_expected.amount is null and not income_expected.received
        returning id into v_id;
        if v_id is not null then
          n_income := n_income + 1;
          insert into change_log (actor_id, action, entity, entity_id, detail)
          values (null, 'ingreso_generado', 'jobsites', j.id, jsonb_build_object('name', j.name, 'month', m));
        end if;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;

  for r in select * from recurring_expenses where active loop
    m := greatest(month_start(r.active_since), accounting_floor());
    while m <= month_start(d) loop
      if r.frequency = 'monthly' or extract(month from m)::int = r.month then
        v_due := month_day(m, r.day);
        if v_due <= d and v_due >= r.active_since then
          v_id := null;
          insert into expenses (category_id, spent_on, amount, note, jobsite_id, recurring_id, period)
          values (r.category_id, v_due, r.amount, r.name, r.jobsite_id, r.id, m)
          on conflict (recurring_id, period) do nothing
          returning id into v_id;
          if v_id is not null then
            n_expense := n_expense + 1;
            insert into change_log (actor_id, action, entity, entity_id, detail)
            values (null, 'gasto_recurrente_generado', 'expenses', v_id,
                    jsonb_build_object('name', r.name, 'amount', r.amount, 'day', v_due));
          end if;
        end if;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
  return jsonb_build_object('income', n_income, 'expenses', n_expense);
end $function$;

-- Permisos de ejecución.
revoke execute on function quote_number_label(bigint), quote_is_residential(uuid), quote_lines_no_tax(jsonb),
  quote_versions_residential(), set_lead_cleaning_type(uuid, text), set_jobsite_cleaning_type(uuid, text),
  quote_accept_until(quote_versions), jobsites_contract_default(), jobsite_contract_ready(uuid), jobsite_contracts_expire(),
  quote_contract_status(uuid), quote_needs_update(uuid), contract_guard_visits(), contract_guard_visit_staff(),
  contract_guard_assignments(), quote_acceptance_text(uuid), quote_acceptance_copy(uuid), portal_mark_acceptance_copy(uuid)
  from public, anon, authenticated;
grant execute on function quote_number_label(bigint), set_lead_cleaning_type(uuid, text), set_jobsite_cleaning_type(uuid, text)
  to authenticated;
grant execute on function portal_mark_acceptance_copy(uuid), jobsite_contracts_expire() to service_role;
