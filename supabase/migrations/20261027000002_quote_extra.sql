-- Hito 7, orden 26: quote de extra desde el jobsite (D-237, D-238).
-- Un extra es otro quote para una cuenta existente: sin walkthrough, con las mismas líneas, tax (6% editable),
-- casilla Gravable, vigencia, destinatarios, SOW y portal que el quote de siempre (D-005, D-006, D-077, D-209).
-- Al aceptarlo NO nace Cliente ni Jobsite: su total se suma al ingreso esperado del mes del servicio (D-238); sin
-- fecha del servicio, al mes en que se acepta (D-200). Permisos: los del quote (quotes_ver, quotes_editar,
-- quotes_ver_precios, quotes_enviar, sow_contratos_subir_ver).

-- Un quote es de un sitio del lead (el de siempre) o un extra de un jobsite.
alter table quotes add column kind text not null default 'site' check (kind in ('site', 'extra'));
alter table quotes add column jobsite_id uuid references jobsites(id) on delete cascade;
alter table quotes alter column site_id drop not null;
alter table quotes alter column lead_id drop not null;
alter table quotes alter column walkthrough_id drop not null;
alter table quotes add constraint quotes_kind_shape check (
  (kind = 'site' and site_id is not null and lead_id is not null and walkthrough_id is not null and jobsite_id is null)
  or (kind = 'extra' and jobsite_id is not null and site_id is null and walkthrough_id is null));
create index quotes_jobsite on quotes (jobsite_id) where jobsite_id is not null;

-- Fecha del servicio del extra (D-238: decide el mes del ingreso).
alter table quote_versions add column service_date date;

-- Armado ------------------------------------------------------------------------------------------------------

-- "Nuevo quote" del jobsite: abre el borrador sin enviar que ya exista (D-200) o crea un extra nuevo con su
-- borrador 1.0. El correo de contacto es el del jobsite.
create function create_extra_quote(p_jobsite uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  j jobsites;
  v_quote uuid;
begin
  if not (has_permission('quotes_editar') and has_permission('quotes_ver_precios')) then
    raise exception 'No tienes permiso para armar quotes' using errcode = '42501';
  end if;
  select * into j from jobsites where id = p_jobsite;
  if j.id is null then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
  if j.status = 'terminated' then raise exception 'El jobsite está terminado' using errcode = '22023'; end if;
  select q.id into v_quote from quotes q
   where q.kind = 'extra' and q.jobsite_id = p_jobsite
     and not exists (select 1 from quote_versions v where v.quote_id = q.id and v.status <> 'draft')
   order by q.created_at desc limit 1;
  if v_quote is not null then return v_quote; end if;
  insert into quotes (kind, jobsite_id, created_by) values ('extra', p_jobsite, current_profile_id()) returning id into v_quote;
  insert into quote_versions (quote_id, minor, walkthrough_version, contact_email, created_by)
  values (v_quote, 0, 0, nullif(lower(btrim(j.contact_email)), ''), current_profile_id());
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'quote_extra_creado', 'quotes', v_quote, jsonb_build_object('jobsite_id', p_jobsite, 'name', j.name));
  return v_quote;
end $$;

-- Fecha del servicio de un borrador de extra (opcional).
create function set_quote_service_date(p_version uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
begin
  if not (has_permission('quotes_editar') and has_permission('quotes_ver_precios')) then
    raise exception 'No tienes permiso para armar quotes' using errcode = '42501';
  end if;
  select * into v from quote_versions where id = p_version for update;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Solo se edita un borrador' using errcode = '22023'; end if;
  if (select kind from quotes where id = v.quote_id) <> 'extra' then
    raise exception 'Solo un extra lleva fecha del servicio' using errcode = '22023';
  end if;
  update quote_versions set service_date = p_date where id = p_version;
end $$;

-- Versiones del quote en JSON (el mismo formato de get_site_quote; sin quotes_ver_precios no hay montos).
create function quote_versions_json(p_quote uuid, prices boolean, sow boolean) returns jsonb
language sql stable security definer set search_path = public as $$
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
      'sent_at', v.sent_at, 'expires_at', v.expires_at, 'viewed_at', v.viewed_at, 'decided_at', v.decided_at,
      'sent_by', (select full_name from profiles where id = v.sent_by),
      'decision', (select jsonb_build_object('kind', d.kind, 'name', d.signer_name, 'title', d.signer_title,
                     'reason_es', r.label_es, 'reason_en', r.label_en, 'note', d.note, 'at', d.created_at, 'email', d.email)
                     from quote_decisions d left join lost_reasons r on r.id = d.reason_id where d.version_id = v.id)
    ) order by v.minor desc), '[]'::jsonb)
    from quote_versions v where v.quote_id = p_quote
$$;

-- Detalle de un quote de extra para la app: el jobsite, su cliente, el idioma y las versiones.
create function get_extra_quote(p_quote uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  j jobsites;
  c clients;
begin
  if not (has_permission('quotes_ver') or has_permission('quotes_editar') or has_permission('quotes_enviar')) then
    raise exception 'No tienes permiso para ver quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  select * into q from quotes where id = p_quote and kind = 'extra';
  if q.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  select * into j from jobsites where id = q.jobsite_id;
  select * into c from clients where id = j.client_id;
  update quote_versions set decision_seen_at = now()
   where quote_id = q.id and decided_at is not null and decision_seen_at is null;
  return jsonb_build_object(
    'quote_id', q.id, 'jobsite_id', j.id, 'jobsite', j.name, 'address', j.address, 'company', c.name,
    'language', coalesce((select language from leads where id = c.lead_id), 'en'),
    'versions', quote_versions_json(q.id, has_permission('quotes_ver_precios'), has_permission('sow_contratos_subir_ver')));
end $$;

-- Quotes de extra del jobsite con su estado (la última versión de cada uno).
create function jobsite_extra_quotes(p_jobsite uuid)
returns table (quote_id uuid, version text, status quote_status, total numeric, service_date date, sent_at timestamptz,
               decided_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not (has_permission('quotes_ver') or has_permission('quotes_editar') or has_permission('quotes_enviar')) then
    raise exception 'No tienes permiso para ver quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  return query
    select q.id, quote_version_label(lv.minor), lv.status, case when has_permission('quotes_ver_precios') then lv.total end,
           lv.service_date, lv.sent_at, lv.decided_at, q.created_at
      from quotes q
      join lateral (select * from quote_versions v where v.quote_id = q.id order by v.minor desc limit 1) lv on true
     where q.kind = 'extra' and q.jobsite_id = p_jobsite
     order by q.created_at desc;
end $$;

-- Funciones del quote de siempre que ahora también sirven al extra --------------------------------------------

-- Versión nueva: el extra no tiene walkthrough (conserva el 0) y copia la fecha del servicio.
create or replace function new_quote_version(p_quote uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  last quote_versions;
  w walkthroughs;
  v_new uuid;
begin
  if not (has_permission('quotes_editar') and has_permission('quotes_ver_precios')) then
    raise exception 'No tienes permiso para armar quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  select * into last from quote_versions where quote_id = p_quote order by minor desc limit 1 for update;
  if last.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if last.status in ('draft', 'accepted') then
    raise exception 'Este quote no admite una versión nueva' using errcode = '22023';
  end if;
  select wk.* into w from quotes q join walkthroughs wk on wk.id = q.walkthrough_id where q.id = p_quote;
  insert into quote_versions (quote_id, minor, walkthrough_version, lines, tax_rate, valid_days, contact_email,
                              recipients, subtotal, discount, tax, total, sow_path, service_date, created_by)
  values (p_quote, last.minor + 1, coalesce(w.current_version, last.walkthrough_version), last.lines, last.tax_rate, last.valid_days,
          last.contact_email, last.recipients, last.subtotal, last.discount, last.tax, last.total, last.sow_path, last.service_date,
          current_profile_id())
  returning id into v_new;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'quote_version_nueva', 'quotes', p_quote,
          jsonb_build_object('version', quote_version_label(last.minor + 1)));
  return v_new;
end $$;

-- Envío, paso 1: para un extra, empresa = cliente, sitio y dirección = jobsite, sin frecuencia; idioma del lead del
-- cliente o inglés. Devuelve además extra y service_date (el PDF y el portal los muestran).
create or replace function prepare_send_quote(p_version uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
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
  if not has_permission('quotes_enviar') then
    raise exception 'No tienes permiso para enviar quotes' using errcode = '42501';
  end if;
  select * into v from quote_versions where id = p_version;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Este quote ya se envió' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(v.lines->'services', '[]'::jsonb)) = 0 then
    raise exception 'El quote necesita al menos un servicio' using errcode = '22023';
  end if;
  if v.sow_path is null then raise exception 'Falta el SOW' using errcode = '22023'; end if;
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
      'lines', v.lines, 'tax_rate', v.tax_rate, 'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total,
      'valid_days', v.valid_days, 'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to));
  end if;
  select * into l from leads where id = q.lead_id;
  select * into s from lead_sites where id = q.site_id;
  select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
  return jsonb_build_object(
    'version_id', v.id, 'quote_id', v.quote_id, 'version', quote_version_label(v.minor), 'language', l.language,
    'company', l.company, 'site', coalesce(nullif(btrim(s.name), ''), s.address),
    'address', coalesce(nullif(btrim(wv.data->'contact'->>'address'), ''), s.address),
    'frequency', wv.data->'frequency', 'extra', false, 'service_date', null, 'lines', v.lines, 'tax_rate', v.tax_rate,
    'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total, 'valid_days', v.valid_days,
    'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to));
end $$;

-- Portal: lo que ve el cliente lleva además si es un extra y su fecha del servicio (del quote, no del snapshot, para
-- no depender de la Edge Function).
create or replace function portal_quote(p_session_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
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
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id,
                  'label', case when v.snapshot->>'language' = 'es' then r.label_es else r.label_en end) order by r.sort), '[]')
                  from lost_reasons r where r.active),
    'decision', (select jsonb_build_object('kind', d.kind, 'name', d.signer_name, 'at', d.created_at)
                   from quote_decisions d where d.version_id = v.id));
end $$;

-- Decisión del cliente. El quote de siempre no cambia; el extra aceptado no crea Cliente ni Jobsite: crea la línea de
-- extra en el ingreso del mes del servicio (D-238) y no toca el estado del lead. jobsite_id va en null para el extra
-- (la Edge Function copia el SOW solo cuando nace un jobsite).
create or replace function portal_decide(p_session_hash text, p_kind text, p_name text, p_title text, p_reason uuid,
                                         p_note text, p_read_confirmed boolean, p_ip text, p_user_agent text) returns jsonb
language plpgsql security definer set search_path = public as $$
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
    if ses.sow_opened_at is null then raise exception 'Abre el SOW para poder continuar' using errcode = '22023'; end if;
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
                               read_confirmed, terms_document_id, ip, user_agent)
  values (v.id, p_kind, ses.email, nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_title, '')), ''),
          p_reason, v_note, ses.sow_opened_at, coalesce(p_read_confirmed, false),
          case when p_kind = 'accepted' then v_terms end, left(p_ip, 100), left(p_user_agent, 400));
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
      'sender_language', (select language from profiles where id = v.sent_by));
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
    insert into jobsites (client_id, site_id, name, address, contact_name, contact_phone, contact_email, frequency,
                          walkthrough_id, walkthrough_version, created_by)
    values (v_client, s.id, coalesce(nullif(btrim(s.name), ''), s.address),
            coalesce(nullif(btrim(wv.data->'contact'->>'address'), ''), s.address),
            nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(wv.data->'contact'->>'phone'), ''),
            coalesce(nullif(lower(btrim(wv.data->'contact'->>'email')), ''), v.contact_email),
            wv.data->'frequency', q.walkthrough_id, v.walkthrough_version, v.sent_by)
    returning id into v_jobsite;
    insert into jobsite_rates (jobsite_id, monthly_rate, quote_version_id, set_by) values (v_jobsite, v.total, v.id, v.sent_by);
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (null, 'jobsite_creado', 'jobsites', v_jobsite, jsonb_build_object('company', l.company, 'name', s.name));
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
    'sender_language', (select language from profiles where id = v.sent_by));
end $$;

-- Pendientes del Inicio: también los quotes de extra (con el jobsite en vez del lead).
drop function home_quote_pending();
create function home_quote_pending()
returns table (kind text, version_id uuid, lead_id uuid, jobsite_id uuid, company text, site text, at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not (has_permission('quotes_ver') or has_permission('quotes_editar') or has_permission('quotes_enviar')) then
    return;
  end if;
  perform expire_quotes();
  return query
    select (case when v.decided_at is not null and v.decision_seen_at is null then v.status::text else 'expiring' end),
           v.id, q.lead_id, q.jobsite_id, coalesce(l.company, c.name),
           coalesce(nullif(btrim(s.name), ''), s.address, j.name),
           coalesce(v.decided_at, v.expires_at)
      from quote_versions v
      join quotes q on q.id = v.quote_id
      left join leads l on l.id = q.lead_id
      left join lead_sites s on s.id = q.site_id
      left join jobsites j on j.id = q.jobsite_id
      left join clients c on c.id = j.client_id
     where (v.decided_at is not null and v.decision_seen_at is null)
        or (v.status in ('sent', 'viewed') and v.expires_at <= now() + interval '3 days')
     order by coalesce(v.decided_at, v.expires_at) desc;
end $$;

revoke execute on function quote_versions_json(uuid, boolean, boolean) from public, anon, authenticated;
revoke execute on function create_extra_quote(uuid), set_quote_service_date(uuid, date), get_extra_quote(uuid),
  jobsite_extra_quotes(uuid), home_quote_pending() from public, anon;
grant execute on function create_extra_quote(uuid), set_quote_service_date(uuid, date), get_extra_quote(uuid),
  jobsite_extra_quotes(uuid), home_quote_pending() to authenticated;
-- Las funciones reemplazadas conservan sus permisos (create or replace no los cambia).
