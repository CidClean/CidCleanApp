-- D-352 (pedido del dueño, 2026-11-20): "el orgánico tiene prioridad sobre el frío". Un lead que ya existe en frío y
-- vuelve a llegar por un medio potencial (website o anuncio) pasa a potencial: temperatura potential y, si estaba en el
-- flujo de correos en frío, estado Interesado; avisa como un potencial nuevo. Un frío que llega para un lead que ya es
-- potencial no lo baja (solo se junta). Duplicados: mismo email o mismo teléfono en un lead abierto (D-350).

create function lead_promote_potential(p_lead uuid, p_source text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  l leads;
begin
  select * into l from leads where id = p_lead for update;
  if l.id is null or l.temperature = 'potential' or l.status in ('won', 'lost') then return false; end if;
  update leads set temperature = 'potential',
         status = case when status in ('new', 'contacted', 'waiting', 'follow_up', 'follow_up_2', 'no_response')
                       then 'interested'::lead_status else status end
   where id = p_lead;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (null, 'lead_a_potencial', 'leads', p_lead,
          jsonb_build_object('company', lead_display_name(l.company, l.contact_name), 'source_name', p_source,
                             'antes', l.status));
  begin
    perform notify_permission(array['leads_ver'], 'lead_potential',
      jsonb_build_object('name', lead_display_name(l.company, l.contact_name), 'source', p_source),
      jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', p_lead)), false,
      'lp:' || p_lead || ':' || extract(epoch from clock_timestamp()));
  exception when others then null;
  end;
  return true;
end $$;
revoke all on function lead_promote_potential(uuid, text) from public, anon, authenticated;

-- Website: si la solicitud se juntó con un lead que ya existía (attached), ese lead sube a potencial.
create function site_submission_promote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.attached and new.lead_id is not null then
    perform lead_promote_potential(new.lead_id, 'Website');
  end if;
  return new;
end $$;
revoke all on function site_submission_promote() from public, anon, authenticated;
create trigger site_submission_promote after insert on site_submissions
  for each row execute function site_submission_promote();

create or replace function lead_intake(p_key_hash text, p_items jsonb) returns jsonb
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
      -- D-352: lo que llega por un medio potencial (anuncio) sube a potencial un lead frío.
      if src.enters_as = 'potential' then perform lead_promote_potential(v_lead, v_label); end if;
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
