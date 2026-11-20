-- Orden 162 (D-349, D-350 (4)): quote one-time.
--  · quotes.kind 'one_time': quote de un sitio del lead con precio total, fecha y hora del servicio y alcance; sin
--    tarifa mensual, sin contrato mensual y sin SOW; el walkthrough es opcional.
--  · Portal: muestra precio total, fecha y alcance y se acepta o rechaza como hoy. Texto legal: el quote one-time usa
--    la misma casilla que ya muestra el quote de un extra (no hay términos propios del one-time en legal/; pendiente
--    del abogado).
--  · Al aceptar: cliente (nombre de la persona si es residencial), jobsite marcado one-time (sin tarifa mensual: no
--    genera ingreso mensual ni cuenta como cuenta mensual), una sola visita en el Schedule en esa fecha y hora, e
--    ingreso único (income_extras) el mes del servicio.

-- 1. Datos ------------------------------------------------------------------------------------------------------------
alter table quotes drop constraint quotes_kind_check;
alter table quotes add constraint quotes_kind_check check (kind in ('site', 'extra', 'one_time'));
alter table quotes drop constraint quotes_kind_shape;
alter table quotes add constraint quotes_kind_shape check (
  (kind = 'site' and site_id is not null and lead_id is not null and walkthrough_id is not null and jobsite_id is null)
  or (kind = 'extra' and jobsite_id is not null and site_id is null and walkthrough_id is null)
  or (kind = 'one_time' and site_id is not null and lead_id is not null and jobsite_id is null));

-- Aceptar sin SOW (extra y one-time, D-239): la base pedía sow_read_at en toda aceptación, así que un quote sin SOW no
-- se podía aceptar en el portal. portal_decide ya exige abrir el SOW cuando la versión lo tiene; la regla de la tabla
-- queda en firma, cargo y casilla.
alter table quote_decisions drop constraint quote_decisions_accept;
alter table quote_decisions add constraint quote_decisions_accept
  check (kind <> 'accepted' or (signer_name is not null and signer_title is not null and read_confirmed));

alter table quote_versions
  add column service_time time,
  add column scope text check (scope is null or length(scope) <= 2000);

-- Jobsite de un proyecto one-time (D-200): se ve en Accounts con la etiqueta One-time hasta que pasa la fecha del
-- servicio; después, en Archived.
alter table jobsites
  add column one_time boolean not null default false,
  add column one_time_on date;

-- 2. Armar el quote one-time ---------------------------------------------------------------------------------------
-- Crea el quote one-time del sitio con su borrador 1.0 (si ya existe, lo devuelve). Walkthrough opcional (D-350 (4)):
-- si el sitio tiene uno cerrado, queda enlazado. Solo para leads One-time.
create function ensure_one_time_quote(p_site uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_quote uuid;
  v_kind text;
  w walkthroughs;
  l leads;
  v_contact text;
begin
  if not (has_permission('quotes_editar') and has_permission('quotes_ver_precios')) then
    raise exception 'No tienes permiso para armar quotes' using errcode = '42501';
  end if;
  select id, kind into v_quote, v_kind from quotes where site_id = p_site;
  if v_quote is not null then
    if v_kind <> 'one_time' then raise exception 'El sitio ya tiene un quote mensual' using errcode = '22023'; end if;
    return v_quote;
  end if;
  select l2.* into l from lead_sites s join leads l2 on l2.id = s.lead_id where s.id = p_site;
  if l.id is null then raise exception 'El sitio no existe' using errcode = 'P0002'; end if;
  if l.service <> 'one_time' then raise exception 'El lead no es one-time' using errcode = '22023'; end if;
  select * into w from walkthroughs where site_id = p_site and current_version >= 1;
  if w.id is not null then
    select nullif(btrim(lower(data->'contact'->>'email')), '') into v_contact
      from walkthrough_versions where walkthrough_id = w.id and version = w.current_version;
  end if;
  v_contact := coalesce(v_contact, nullif(lower(btrim(l.email)), ''));
  insert into quotes (kind, site_id, lead_id, walkthrough_id, created_by)
  values ('one_time', p_site, l.id, w.id, current_profile_id()) returning id into v_quote;
  insert into quote_versions (quote_id, minor, walkthrough_version, contact_email, created_by)
  values (v_quote, 0, coalesce(w.current_version, 0), v_contact, current_profile_id());
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'quote_creado', 'quotes', v_quote,
          jsonb_build_object('lead_id', l.id, 'site_id', p_site, 'one_time', true));
  return v_quote;
end $$;

-- Guarda el borrador one-time: precio total, fecha y hora del servicio, alcance, vigencia y destinatarios. El precio
-- es un renglón de servicio gravable; el impuesto residencial sigue la regla que ya existe (quote_versions_residential
-- quita el gravable en residencial).
create function save_one_time_quote(p_version uuid, p_price numeric, p_date date, p_time time, p_scope text,
                                    p_valid_days integer, p_recipients text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
  t record;
  clean text[];
  v_scope text := nullif(btrim(coalesce(p_scope, '')), '');
  v_lines jsonb;
begin
  if not (has_permission('quotes_editar') and has_permission('quotes_ver_precios')) then
    raise exception 'No tienes permiso para armar quotes' using errcode = '42501';
  end if;
  select * into v from quote_versions where id = p_version for update;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if (select kind from quotes where id = v.quote_id) <> 'one_time' then raise exception 'No es un quote one-time' using errcode = '22023'; end if;
  if v.status <> 'draft' then raise exception 'Solo se edita un borrador' using errcode = '22023'; end if;
  if p_price is not null and (p_price < 0 or p_price > 10000000) then raise exception 'Precio no válido' using errcode = '22023'; end if;
  if v_scope is not null and length(v_scope) > 2000 then raise exception 'Alcance muy largo' using errcode = '22023'; end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 30 then raise exception 'Vigencia no válida' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct e), '{}') into clean
    from (select lower(btrim(x)) e from unnest(coalesce(p_recipients, '{}')) x) s where e <> '';
  if exists (select 1 from unnest(clean) e where e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') or cardinality(clean) > 10 then
    raise exception 'Correo no válido' using errcode = '22023';
  end if;
  v_lines := jsonb_build_object('services', case when p_price is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'label', 'One-time service', 'description', left(v_scope, 200), 'amount', round(p_price, 2), 'taxable', true)) end,
    'addons', '[]'::jsonb, 'discounts', '[]'::jsonb);
  update quote_versions set lines = v_lines, service_date = p_date, service_time = p_time, scope = v_scope,
         valid_days = p_valid_days, recipients = clean
   where id = p_version;
  -- Totales con las líneas ya ajustadas por la regla residencial.
  select lines into v_lines from quote_versions where id = p_version;
  select * into t from quote_totals(v_lines, v.tax_rate);
  update quote_versions set subtotal = t.subtotal, discount = t.discount, tax = t.tax, total = t.total where id = p_version;
end $$;

-- Quote one-time de un sitio, para el editor de la app.
create function get_one_time_quote(p_site uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  l leads;
  s lead_sites;
begin
  if not (has_permission('quotes_ver') or has_permission('quotes_editar') or has_permission('quotes_enviar')) then
    raise exception 'No tienes permiso para ver quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  select * into s from lead_sites where id = p_site;
  if s.id is null then raise exception 'El sitio no existe' using errcode = 'P0002'; end if;
  select * into l from leads where id = s.lead_id;
  select * into q from quotes where site_id = p_site and kind = 'one_time';
  if q.id is not null then
    update quote_versions set decision_seen_at = now()
     where quote_id = q.id and decided_at is not null and decision_seen_at is null;
  end if;
  return jsonb_build_object('quote_id', q.id, 'quote_number', case when q.id is not null then quote_number_label(q.number) end,
    'company', lead_display_name(l.company, l.contact_name), 'site', lead_site_label(s.name, s.address),
    'cleaning_type', l.cleaning_type, 'service', l.service, 'language', l.language,
    'versions', case when q.id is null then '[]'::jsonb
                     else quote_versions_json(q.id, has_permission('quotes_ver_precios'), has_permission('sow_contratos_subir_ver')) end);
end $$;

revoke all on function ensure_one_time_quote(uuid), save_one_time_quote(uuid, numeric, date, time, text, integer, text[]),
  get_one_time_quote(uuid) from public, anon;
grant execute on function ensure_one_time_quote(uuid), save_one_time_quote(uuid, numeric, date, time, text, integer, text[]),
  get_one_time_quote(uuid) to authenticated;

-- 3. Funciones que ya existían, con el caso one-time (cuerpos iguales a su última versión salvo lo marcado).

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
      'tax_rate', v.tax_rate, 'valid_days', v.valid_days, 'service_date', v.service_date, 'service_time', to_char(v.service_time, 'HH24:MI'), 'scope', v.scope,
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
                              recipients, subtotal, discount, tax, total, sow_path, service_date, service_time, scope, created_by)
  values (p_quote, last.minor + 1, coalesce(w.current_version, last.walkthrough_version), last.lines, last.tax_rate, least(last.valid_days, 30),
          last.contact_email, last.recipients, last.subtotal, last.discount, last.tax, last.total, last.sow_path, last.service_date, last.service_time, last.scope,
          current_profile_id())
  returning id into v_new;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'quote_version_nueva', 'quotes', p_quote,
          jsonb_build_object('version', quote_version_label(last.minor + 1)));
  return v_new;
end $function$;

CREATE OR REPLACE FUNCTION public.send_quote_data(p_version uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v quote_versions;
  q quotes;
  l leads;
  s lead_sites;
  wv walkthrough_versions;
  j jobsites;
  c clients;
  v_to text[];
begin
  select * into v from quote_versions where id = p_version;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Este quote ya se envió' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(v.lines->'services', '[]'::jsonb)) = 0 then
    raise exception 'El quote necesita al menos un servicio' using errcode = '22023';
  end if;
  -- D-318 (reemplaza de D-209 la subida del PDF): el SOW se arma en la app; no se envía si le falta un dato
  -- obligatorio. D-239: el quote de un extra sigue sin SOW.
  if not exists (select 1 from quotes x where x.id = v.quote_id and x.kind in ('extra', 'one_time'))
     and cardinality(sow_missing_fields(sow_effective_fields(v.id))) > 0 then
    raise exception 'Falta completar el SOW' using errcode = '22023';
  end if;
  select array_agg(distinct e) into v_to from unnest(array_append(v.recipients, v.contact_email)) e where e is not null;
  if v_to is null or cardinality(v_to) = 0 then
    raise exception 'El quote no tiene a quién enviarse' using errcode = '22023';
  end if;
  select * into q from quotes where id = v.quote_id;
  if q.kind = 'extra' then
    select * into j from jobsites where id = q.jobsite_id;
    select * into c from clients where id = j.client_id;
    return jsonb_build_object(
      'version_id', v.id, 'quote_id', v.quote_id, 'version', quote_version_label(v.minor),
      'language', coalesce((select language from leads where id = c.lead_id), 'en'),
      'company', c.name, 'site', j.name, 'address', j.address, 'frequency', null, 'extra', true, 'service_date', v.service_date,
      'contact_name', nullif(btrim(j.contact_name), ''),
      'lines', v.lines, 'tax_rate', v.tax_rate, 'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total,
      'valid_days', v.valid_days, 'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to));
  end if;
  select * into l from leads where id = q.lead_id;
  select * into s from lead_sites where id = q.site_id;
  -- Orden 162: one-time como un extra (total de una vez y fecha del servicio), con la hora y el alcance.
  if q.kind = 'one_time' then
    if v.service_date is null or v.service_time is null then
      raise exception 'Falta la fecha y hora del servicio' using errcode = '22023';
    end if;
    if v.scope is null then raise exception 'Falta el alcance' using errcode = '22023'; end if;
    select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
    return jsonb_build_object(
      'version_id', v.id, 'quote_id', v.quote_id, 'version', quote_version_label(v.minor), 'language', l.language,
      'company', lead_display_name(l.company, l.contact_name), 'site', lead_site_label(s.name, s.address),
      'address', coalesce(nullif(btrim(wv.data->'contact'->>'address'), ''), s.address, 'Naples, FL'),
      'frequency', null, 'extra', true, 'one_time', true, 'service_date', v.service_date,
      'visit_time', to_char(v.service_time, 'HH24:MI'), 'scope', v.scope,
      'contact_name', coalesce(nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(l.contact_name), '')),
      'lines', v.lines, 'tax_rate', v.tax_rate, 'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total,
      'valid_days', v.valid_days, 'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to));
  end if;
  select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
  return jsonb_build_object(
    'version_id', v.id, 'quote_id', v.quote_id, 'version', quote_version_label(v.minor), 'language', l.language,
    'company', lead_display_name(l.company, l.contact_name), 'site', lead_site_label(s.name, s.address),
    'address', coalesce(nullif(btrim(wv.data->'contact'->>'address'), ''), s.address, 'Naples, FL'),
    'frequency', wv.data->'frequency', 'extra', false, 'service_date', null, 'lines', v.lines, 'tax_rate', v.tax_rate,
    'contact_name', coalesce(nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(l.contact_name), '')),
    'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total, 'valid_days', v.valid_days,
    'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to),
    -- Lo que necesita send-quote para armar el PDF del SOW (D-318) y guardarlo con la versión.
    'sow', jsonb_build_object('fields', sow_effective_fields(v.id), 'sow_no', sow_label(q.number),
                              'quote_no', quote_number_label(q.number), 'quote_version', quote_version_label(v.minor),
                              'cleaning_type', l.cleaning_type));
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
    'extra', (select kind in ('extra', 'one_time') from quotes where id = v.quote_id), 'service_date', v.service_date,
    'one_time', (select kind = 'one_time' from quotes where id = v.quote_id), 'service_time', to_char(v.service_time, 'HH24:MI'), 'scope', v.scope,
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

CREATE OR REPLACE FUNCTION public.quote_mail_info(p_version uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v quote_versions;
  q quotes;
  v_to text[];
  v_contact text;
begin
  perform expire_quotes();
  select * into v from quote_versions where id = p_version;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status not in ('sent', 'viewed') then raise exception 'Este quote no está abierto' using errcode = '22023'; end if;
  select array_agg(distinct e) into v_to from unnest(array_append(v.recipients, v.contact_email)) e where e is not null;
  select * into q from quotes where id = v.quote_id;
  if q.kind = 'extra' then
    select nullif(btrim(contact_name), '') into v_contact from jobsites where id = q.jobsite_id;
  else
    select coalesce(nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(l.contact_name), '')) into v_contact
      from leads l
      left join walkthrough_versions wv on wv.walkthrough_id = q.walkthrough_id and wv.version = v.walkthrough_version
     where l.id = q.lead_id;
  end if;
  return jsonb_build_object('expires_at', v.expires_at, 'language', v.snapshot->>'language',
    'company', v.snapshot->>'company', 'site', v.snapshot->>'site', 'version', quote_version_label(v.minor),
    'address', v.snapshot->>'address', 'frequency', v.snapshot->'frequency',
    'extra', coalesce((v.snapshot->>'extra')::boolean, false), 'service_date', v.snapshot->>'service_date', 'visit_time', v.snapshot->>'visit_time',
    'contact_name', v_contact, 'lines', v.lines, 'total', v.total, 'pdf_path', v.pdf_path,
    'recipients', to_jsonb(v_to));
end $function$;

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
  a record;
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

  -- Orden 162 (D-350 (4)): al aceptar un one-time nace el cliente (la persona si es residencial), un jobsite marcado
  -- one-time sin tarifa mensual ni contrato mensual, una sola visita en el Schedule en la fecha y hora del servicio y
  -- el ingreso único del mes del servicio. Rechazar o pedir cambios siguen como el quote del sitio (abajo).
  if q.kind = 'one_time' and p_kind = 'accepted' then
    select id into v_client from clients where lead_id = l.id;
    if v_client is null then
      insert into clients (lead_id, name, phone, email, address_line1, address_line2, city, state, zip, created_by)
      values (l.id, lead_display_name(l.company, l.contact_name), nullif(btrim(l.phone), ''), nullif(lower(btrim(l.email)), ''),
              s.address_line1, s.address_line2, s.city, s.state, s.zip, v.sent_by)
      returning id into v_client;
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'cliente_creado', 'clients', v_client, jsonb_build_object('company', lead_display_name(l.company, l.contact_name)));
    end if;
    select id into v_jobsite from jobsites where site_id = s.id for update;
    if v_jobsite is null then
      insert into jobsites (client_id, site_id, name, address, address_line1, address_line2, city, state, zip,
                            contact_name, contact_phone, contact_email, created_by, cleaning_type,
                            contract_status, contract_accepted_at, start_date, one_time, one_time_on)
      values (v_client, s.id, lead_site_label(s.name, coalesce(format_address(s.address_line1, s.address_line2, s.city, s.state, s.zip), s.address)),
              coalesce(format_address(s.address_line1, s.address_line2, s.city, s.state, s.zip), s.address, 'Naples, FL'),
              s.address_line1, s.address_line2, s.city, s.state, s.zip,
              nullif(btrim(l.contact_name), ''), nullif(btrim(l.phone), ''), coalesce(v.contact_email, nullif(lower(btrim(l.email)), '')),
              v.sent_by, l.cleaning_type, 'both_signed', now(), v.service_date, true, v.service_date)
      returning id into v_jobsite;
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'jobsite_creado', 'jobsites', v_jobsite,
              jsonb_build_object('company', lead_display_name(l.company, l.contact_name), 'name', s.name, 'one_time', true));
    else
      update jobsites set one_time = true, one_time_on = v.service_date, start_date = v.service_date,
                          status = 'active', contract_status = 'both_signed', contract_accepted_at = now()
       where id = v_jobsite;
    end if;
    -- Una sola visita (como "agregar visita" del Schedule, D-230: 120 min por defecto; el personal se asigna allí).
    if v.service_date is not null then
      insert into visits (jobsite_id, starts_at, minutes, local_date, generated, edited, created_by)
      values (v_jobsite, (v.service_date + coalesce(v.service_time, time '09:00')) at time zone cc_tz(), 120,
              v.service_date, false, true, null);
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'visita_agregada', 'jobsites', v_jobsite,
              jsonb_build_object('name', lead_site_label(s.name, s.address), 'day', v.service_date, 'minutos', 120, 'one_time', true));
    end if;
    -- Ingreso único el mes del servicio (como un extra); sin tarifa mensual (jobsite_rates), no hay ingreso mensual.
    v_month := month_start(coalesce(v.service_date, cc_today()));
    insert into income_expected (jobsite_id, month) values (v_jobsite, v_month) on conflict (jobsite_id, month) do nothing;
    insert into income_extras (jobsite_id, month, amount, label, service_date, quote_version_id)
    values (v_jobsite, v_month, v.total, 'One-time service', v.service_date, v.id);
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (null, 'ingreso_extra_agregado', 'jobsites', v_jobsite,
            jsonb_build_object('name', lead_site_label(s.name, s.address), 'month', v_month, 'amount', v.total,
                               'version', quote_version_label(v.minor), 'one_time', true));
    if l.status <> 'won' then update leads set status = 'won' where id = l.id; end if;
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (null, 'quote_aceptado', 'quotes', q.id,
            jsonb_build_object('version', quote_version_label(v.minor), 'company', lead_display_name(l.company, l.contact_name), 'one_time', true));
    return jsonb_build_object(
      'kind', p_kind, 'company', lead_display_name(l.company, l.contact_name), 'site', lead_site_label(s.name, s.address),
      'version', quote_version_label(v.minor), 'lead_id', l.id, 'quote_id', q.id, 'jobsite_id', v_jobsite, 'extra', false,
      'one_time', true, 'sow_path', null,
      'sender_email', (select email from profiles where id = v.sent_by),
      'sender_language', (select language from profiles where id = v.sent_by))
      || coalesce(quote_acceptance_copy(v.id), '{}'::jsonb);
  end if;

  if p_kind = 'accepted' then
    -- Nace el Cliente (uno por lead) con este Jobsite (D-209).
    select id into v_client from clients where lead_id = l.id;
    if v_client is null then
      -- D-319 (3): nace con el teléfono y el correo del lead y con la dirección del primer sitio (la del walkthrough
      -- si la tiene completa; si no, la del sitio del lead), todo editable después.
      select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
      a := walkthrough_address_parts(wv.data, s);
      insert into clients (lead_id, name, phone, email, address_line1, address_line2, city, state, zip, created_by)
      values (l.id, lead_display_name(l.company, l.contact_name), nullif(btrim(l.phone), ''), nullif(lower(btrim(l.email)), ''),
              a.line1, a.line2, a.city, a.state, a.zip, v.sent_by)
      returning id into v_client;
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'cliente_creado', 'clients', v_client, jsonb_build_object('company', lead_display_name(l.company, l.contact_name)));
    end if;
    select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
    a := walkthrough_address_parts(wv.data, s);
    -- D-283: si el sitio ya tiene jobsite (versión nueva tras "Requiere actualización"), se reabre el plazo de 15 días.
    select id into v_jobsite from jobsites where site_id = s.id for update;
    if v_jobsite is null then
      -- D-319: el jobsite toma la dirección completa (partes), sq ft, tipo de lugar, horario de servicio y horas
      -- estimadas por visita del walkthrough (data->'site', orden 111).
      insert into jobsites (client_id, site_id, name, address, address_line1, address_line2, city, state, zip,
                            sqft, facility_type, service_schedule, est_hours_per_visit,
                            contact_name, contact_phone, contact_email, frequency,
                            walkthrough_id, walkthrough_version, created_by, cleaning_type, contract_status, contract_accepted_at)
      values (v_client, s.id, lead_site_label(s.name, coalesce(format_address(a.line1, a.line2, a.city, a.state, a.zip), s.address)),
              coalesce(format_address(a.line1, a.line2, a.city, a.state, a.zip),
                       nullif(btrim(wv.data->'contact'->>'address'), ''), s.address, 'Naples, FL'),
              a.line1, a.line2, a.city, a.state, a.zip,
              coalesce(walkthrough_site_int(wv.data, 'sqft'), s.sqft),
              coalesce(nullif(wv.data->'site'->>'facilityType', ''), s.facility_type),
              nullif(left(btrim(coalesce(wv.data->'site'->>'schedule', '')), 200), ''),
              walkthrough_site_hours(wv.data),
              nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(wv.data->'contact'->>'phone'), ''),
              coalesce(nullif(lower(btrim(wv.data->'contact'->>'email')), ''), v.contact_email),
              wv.data->'frequency', q.walkthrough_id, v.walkthrough_version, v.sent_by, l.cleaning_type, 'pending', now())
      returning id into v_jobsite;
      insert into jobsite_rates (jobsite_id, monthly_rate, quote_version_id, set_by) values (v_jobsite, v.total, v.id, v.sent_by);
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'jobsite_creado', 'jobsites', v_jobsite, jsonb_build_object('company', lead_display_name(l.company, l.contact_name), 'name', s.name));
    else
      update jobsites set contract_status = 'pending', contract_accepted_at = now(), cleaning_type = l.cleaning_type
       where id = v_jobsite;
      update jobsite_rates set monthly_rate = v.total, quote_version_id = v.id, set_by = v.sent_by, set_at = now()
       where jobsite_id = v_jobsite;
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'contrato_pendiente', 'jobsites', v_jobsite, jsonb_build_object('company', lead_display_name(l.company, l.contact_name), 'name', s.name,
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
          'quotes', q.id, jsonb_build_object('version', quote_version_label(v.minor), 'company', lead_display_name(l.company, l.contact_name)));

  return jsonb_build_object(
    'kind', p_kind, 'company', lead_display_name(l.company, l.contact_name), 'site', lead_site_label(s.name, s.address),
    'version', quote_version_label(v.minor), 'lead_id', l.id, 'quote_id', q.id, 'jobsite_id', v_jobsite, 'extra', false,
    'sow_path', v.sow_path,
    'sender_email', (select email from profiles where id = v.sent_by),
    'sender_language', (select language from profiles where id = v.sent_by))
    || case when p_kind = 'accepted' then coalesce(quote_acceptance_copy(v.id), '{}'::jsonb) else '{}'::jsonb end;
end $function$;
