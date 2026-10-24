-- D-239: el quote de un extra (D-238) va sin SOW: no se exige al enviarlo ni para aceptarlo en el portal.
CREATE OR REPLACE FUNCTION public.prepare_send_quote(p_version uuid)
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
  if not has_permission('quotes_enviar') then
    raise exception 'No tienes permiso para enviar quotes' using errcode = '42501';
  end if;
  select * into v from quote_versions where id = p_version;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Este quote ya se envió' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(v.lines->'services', '[]'::jsonb)) = 0 then
    raise exception 'El quote necesita al menos un servicio' using errcode = '22023';
  end if;
  -- D-239: el quote de un extra va sin SOW.
  if v.sow_path is null and not exists (select 1 from quotes x where x.id = v.quote_id and x.kind = 'extra') then
    raise exception 'Falta el SOW' using errcode = '22023';
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
end $function$;
