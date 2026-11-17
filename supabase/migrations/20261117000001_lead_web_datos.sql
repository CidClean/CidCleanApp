-- Orden 110 (D-317, D-319 1-3): datos del lead web en sus campos y arrastre de datos al cerrar el walkthrough y al
-- aceptar el quote.
--  · El sitio del lead web guarda City, State (FL) y ZIP en sus columnas, sin nombre ("Website estimate" ya no existe)
--    y sin texto en Dirección; queda marcado para completar solo la calle (reemplaza de D-311 "Naples, FL").
--  · address_parts_sync conserva City, State y ZIP aunque no haya calle (antes los borraba).
--  · Lead web sin empresa: company vacía (se muestra el contacto con "Completa la empresa"); teléfono como D-216.
--  · Tipo de lugar, sq ft y frecuencia del estimador como datos del sitio del lead (lead_sites).
--  · Al cerrar el walkthrough, su dirección pasa al sitio del lead si está incompleto o marcado para revisar.
--  · Al aceptar: el cliente nace con teléfono, correo y dirección; el jobsite con dirección, sq ft, tipo de lugar,
--    horario de servicio y horas estimadas por visita del walkthrough.

-- Ayudas ------------------------------------------------------------------------------------------------------------

-- Nombre para mostrar de un lead: la empresa, o el contacto si la empresa está vacía.
create function lead_display_name(p_company text, p_contact text) returns text
language sql immutable as $$
  select coalesce(nullif(btrim(coalesce(p_company, '')), ''), nullif(btrim(coalesce(p_contact, '')), ''), 'Lead')
$$;

-- Etiqueta de un sitio: su nombre, su dirección o "Naples, FL" (D-319: el sitio del lead web no tiene nombre).
create function lead_site_label(p_name text, p_address text) returns text
language sql immutable as $$
  select coalesce(nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_address, '')), ''), 'Naples, FL')
$$;

-- Teléfono de EE. UU. como "(239) 555-0142" (D-216); si no son 10 dígitos (u 11 con 1), queda como llegó.
create function us_phone_format(p text) returns text
language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) = 11 and left(d, 1) = '1' then d := substr(d, 2); end if;
  if length(d) = 10 then
    return '(' || substr(d, 1, 3) || ') ' || substr(d, 4, 3) || '-' || substr(d, 7, 4);
  end if;
  return nullif(btrim(coalesce(p, '')), '');
end $$;

-- Partes de la dirección de un walkthrough (data->contact, D-301). Si no tiene calle, las del sitio del lead.
create function walkthrough_address_parts(p_data jsonb, s lead_sites, out line1 text, out line2 text, out city text,
                                          out state text, out zip text)
language plpgsql immutable as $$
declare
  c jsonb := coalesce(p_data->'contact', '{}'::jsonb);
  r record;
begin
  line1 := nullif(btrim(coalesce(c->>'addressLine1', '')), '');
  if line1 is not null then
    line2 := nullif(btrim(coalesce(c->>'addressLine2', '')), '');
    city := nullif(btrim(coalesce(c->>'city', '')), '');
    state := nullif(upper(btrim(coalesce(c->>'state', ''))), '');
    zip := nullif(btrim(coalesce(c->>'zip', '')), '');
  elsif nullif(btrim(coalesce(c->>'address', '')), '') is not null then
    select * into r from parse_us_address(c->>'address');
    line1 := r.line1; line2 := r.line2; city := r.city; state := r.state; zip := r.zip;
  end if;
  if line1 is null and s.id is not null then
    line1 := s.address_line1; line2 := s.address_line2; city := s.city; state := s.state; zip := s.zip;
  end if;
  if not is_us_state(state) then state := null; end if;
  if not is_us_zip(zip) then zip := null; end if;
  line1 := left(line1, 120); line2 := left(line2, 120); city := left(city, 80);
end $$;

-- Números del paso 1 del walkthrough (data->'site', orden 111).
create function walkthrough_site_int(p_data jsonb, p_key text) returns integer
language sql immutable as $$
  select case when (p_data->'site'->>p_key) ~ '^[0-9]{1,8}(\.0+)?$' then (p_data->'site'->>p_key)::numeric::int end
$$;

create function walkthrough_site_hours(p_data jsonb) returns numeric
language sql immutable as $$
  select case when (p_data->'site'->>'estHours') ~ '^[0-9]{1,2}(\.[0-9]{1,2})?$'
               and (p_data->'site'->>'estHours')::numeric between 0 and 24
              then (p_data->'site'->>'estHours')::numeric end
$$;

-- Columnas -----------------------------------------------------------------------------------------------------------

alter table leads alter column company drop not null;
alter table leads drop constraint leads_company_check;
alter table leads add constraint leads_company_check check (company is null or btrim(company) <> '');

-- Un sitio web sin ciudad ni ZIP ("Other") no tiene dirección todavía: se muestra "Naples, FL" (lead_site_label).
alter table lead_sites alter column address drop not null;
alter table lead_sites drop constraint lead_sites_address_check;
alter table lead_sites add constraint lead_sites_address_check check (address is null or btrim(address) <> '');
alter table lead_sites
  add column facility_type text check (facility_type is null or facility_type ~ '^[a-z0-9_]{1,40}$'),
  add column sqft integer check (sqft is null or sqft between 1 and 10000000),
  add column web_frequency text check (web_frequency is null or web_frequency ~ '^[a-z0-9_]{1,40}$');

alter table jobsites
  add column facility_type text check (facility_type is null or facility_type ~ '^[a-z0-9_]{1,40}$'),
  add column sqft integer check (sqft is null or sqft between 1 and 10000000),
  add column service_schedule text check (service_schedule is null or length(service_schedule) <= 200);

-- Disparador de direcciones: City, State y ZIP se conservan sin calle ----------------------------------------------

create or replace function address_parts_sync() returns trigger
language plpgsql set search_path = public as $$
declare
  parts_changed boolean;
  r record;
  copied boolean := false;
begin
  new.address_line1 := nullif(btrim(coalesce(new.address_line1, '')), '');
  new.address_line2 := nullif(btrim(coalesce(new.address_line2, '')), '');
  new.city := nullif(btrim(coalesce(new.city, '')), '');
  new.state := nullif(upper(btrim(coalesce(new.state, ''))), '');
  new.zip := nullif(btrim(coalesce(new.zip, '')), '');
  if new.address_line1 is null then
    -- D-319: sin calle se conservan City, State y ZIP (el lead web trae ciudad y ZIP). Dirección 2 sola no se guarda,
    -- y el State por defecto FL de un formulario vacío tampoco (sin City ni ZIP no hay dirección).
    new.address_line2 := null;
    if new.city is null and new.zip is null then new.state := null; end if;
  end if;

  if tg_op = 'INSERT' then
    parts_changed := coalesce(new.address_line1, new.city, new.zip) is not null;
  else
    parts_changed := (new.address_line1, new.address_line2, new.city, new.state, new.zip)
                     is distinct from (old.address_line1, old.address_line2, old.city, old.state, old.zip);
  end if;

  if parts_changed or (tg_op = 'UPDATE' and new.address_line1 is null and old.address_line1 is not null
                       and new.address is not distinct from old.address) then
    new.address := format_address(new.address_line1, new.address_line2, new.city, new.state, new.zip);
  elsif (tg_op = 'INSERT' or new.address is distinct from old.address) and nullif(btrim(coalesce(new.address, '')), '') is not null then
    -- Jobsite nacido de un sitio de lead: si la línea es la del sitio, se copian sus partes tal cual.
    if tg_table_name = 'jobsites' then
      select s.address_line1, s.address_line2, s.city, s.state, s.zip into r
        from lead_sites s where s.id = (to_jsonb(new)->>'site_id')::uuid and s.address = btrim(coalesce(new.address, ''));
      if found and r.address_line1 is not null then
        new.address_line1 := r.address_line1; new.address_line2 := r.address_line2; new.city := r.city;
        new.state := r.state; new.zip := r.zip;
        copied := true;
      end if;
    end if;
    if not copied then
      select * into r from parse_us_address(new.address);
      new.address_line1 := r.line1; new.address_line2 := r.line2; new.city := r.city; new.state := r.state;
      new.zip := r.zip;
    end if;
    if new.address_line1 is not null and (select ok from parse_us_address(new.address)) is not distinct from true then
      new.address := format_address(new.address_line1, new.address_line2, new.city, new.state, new.zip);
    end if;
  end if;

  -- Para completar: falta alguna parte; un sitio de lead sin calle también (el lead web solo trae ciudad y ZIP).
  new.address_needs_review := (new.address_line1 is not null and (new.city is null or new.state is null or new.zip is null))
    or (new.address_line1 is null and (new.city is not null or new.zip is not null or tg_table_name = 'lead_sites'));
  return new;
end $$;
revoke execute on function address_parts_sync() from public, anon, authenticated;

-- site_submit (D-319 1) -------------------------------------------------------------------------------------------
create or replace function site_submit(p_kind text, p_name text, p_company text, p_email text, p_phone text, p_city text,
                            p_zip text, p_type text, p_sqft integer, p_frequency text, p_message text, p_ip_hash text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s estimator_settings;
  t jsonb;
  f jsonb;
  q record;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_key text;
  v_name text := left(btrim(coalesce(p_name, '')), 60); -- D-200: 60 caracteres
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_city text := btrim(coalesce(p_city, ''));
  v_zip text := nullif(btrim(coalesce(p_zip, '')), '');
  v_note text;
  v_lead uuid;
  v_new boolean := false;
  v_walk boolean := false;
  v_mail boolean := false;
  v_low numeric;
  v_high numeric;
  v_pv numeric;
  v_when text := to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI');
begin
  -- Validación (la Edge Function valida antes; esto es la red de seguridad).
  if p_kind not in ('estimate', 'contact') or v_name = ''
     or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(v_email) > 160
     or length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) not between 10 and 11
     or v_city not in ('Naples', 'Bonita Springs', 'Estero', 'Marco Island', 'Other')
     or (v_zip is not null and v_zip !~ '^[0-9]{5}(-[0-9]{4})?$')
     or length(coalesce(v_company, '')) > 120 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_kind = 'contact' and (length(btrim(coalesce(p_message, ''))) < 10 or length(p_message) > 2000) then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_key := site_email_key(v_email);

  -- Un solo envío del sitio a la vez: el conteo y el insert de abajo quedan bajo este bloqueo hasta el fin de la transacción.
  perform pg_advisory_xact_lock(hashtext('site_submit'));

  -- Límites (D-311 y D-200): 5 por hora por IP (o por /64), 5 por hora en total sin IP, 3 por hora por correo normalizado.
  if (p_ip_hash is not null and (select count(*) from site_submissions
        where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5)
     or (p_ip_hash is null and (select count(*) from site_submissions
        where ip_hash is null and created_at > now() - interval '1 hour') >= 5)
     or (select count(*) from site_submissions where email_key = v_key and created_at > now() - interval '1 hour') >= 3 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if p_kind = 'estimate' then
    select * into s from estimator_settings;
    select x into t from jsonb_array_elements(s.place_types) x where x->>'key' = p_type;
    select x into f from jsonb_array_elements(s.frequencies) x where x->>'key' = p_frequency;
    if t is null or f is null or p_sqft is null or p_sqft not between 200 and 1000000 then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into q from estimate_quote(p_sqft, (t->>'rate')::numeric, (f->>'visits_per_month')::numeric,
                                        (f->>'adjustment')::numeric, s.min_per_visit, s.range_pct, s.round_to);
    v_walk := p_sqft > s.walkthrough_sqft;
    v_low := q.range_low;
    v_high := q.range_high;
    v_pv := q.per_visit;
    -- Tope global (D-200): 40 correos al cliente por hora.
    v_mail := (select count(*) from site_submissions where customer_mail and created_at > now() - interval '1 hour') < 40;
    v_note := format(E'[%s] Website estimate\nType: %s\nSize: %s sq ft\nFrequency: %s\nCity: %s%s\nRange shown: $%s – $%s per month (about $%s per visit)%s',
      v_when, t->>'name', to_char(p_sqft, 'FM999,999,999'), f->>'name', v_city,
      case when v_zip is not null then E'\nZIP: ' || v_zip else '' end,
      to_char(q.range_low, 'FM999,999,999'), to_char(q.range_high, 'FM999,999,999'), to_char(round(q.per_visit), 'FM999,999'),
      case when v_walk then E'\nOver ' || to_char(s.walkthrough_sqft, 'FM999,999') || ' sq ft: walkthrough recommended' else '' end);
  else
    v_note := format(E'[%s] Website message\nCity: %s%s\nMessage: %s', v_when, v_city,
      case when v_zip is not null then E'\nZIP: ' || v_zip else '' end, btrim(p_message));
  end if;
  if v_company is not null and p_kind = 'estimate' then
    v_note := v_note || E'\nCompany: ' || v_company;
  end if;
  if p_kind = 'estimate' and not v_mail then
    v_note := v_note || E'\nEstimate email to the customer not sent: hourly limit reached.'; -- D-200
  end if;

  -- Mismo correo con un lead abierto (orden 101, N2): sus notas NO se tocan. La solicitud queda en site_submissions
  -- enlazada al lead (attached) y la app la muestra en "Solicitudes del sitio", marcada como sin verificar (D-200).
  select id into v_lead from leads
   where lower(email) = v_email and status not in ('won', 'lost')
   order by created_at desc limit 1;
  if v_lead is null then
    -- D-319: sin empresa, company queda vacía para completar (no se copia el nombre de la persona); teléfono como D-216.
    insert into leads (company, contact_name, phone, email, source, status, cleaning_type, notes)
    values (v_company, v_name, us_phone_format(p_phone), v_email, 'web', 'new', 'non_residential', v_note)
    returning id into v_lead;
    v_new := true;
    -- Sitio del lead (D-319): sin nombre; City, State (FL) y ZIP en sus columnas; solo falta la calle (queda para
    -- completar). Tipo de lugar, sq ft y frecuencia del estimador como datos del sitio (precargan el walkthrough).
    insert into lead_sites (lead_id, name, city, state, zip, facility_type, sqft, web_frequency)
    values (v_lead, null, nullif(v_city, 'Other'), 'FL', v_zip,
            case when p_kind = 'estimate' then t->>'key' end, case when p_kind = 'estimate' then p_sqft end,
            case when p_kind = 'estimate' then f->>'key' end);
  end if;

  insert into site_submissions (kind, ip_hash, email, email_key, customer_mail, lead_id, attached, city, zip,
                                type_name, sqft, frequency_name, range_low, range_high, per_visit, message)
  values (p_kind, p_ip_hash, v_email, v_key, v_mail, v_lead, not v_new, v_city, v_zip,
          case when p_kind = 'estimate' then t->>'name' end, case when p_kind = 'estimate' then p_sqft end,
          case when p_kind = 'estimate' then f->>'name' end, v_low, v_high, v_pv,
          case when p_kind = 'contact' then btrim(p_message) end);

  if p_kind = 'estimate' then
    return jsonb_build_object('status', 'ok', 'lead_id', v_lead, 'new_lead', v_new,
      'type_name', t->>'name', 'frequency_name', f->>'name',
      'per_visit', q.per_visit, 'monthly', q.monthly, 'range_low', q.range_low, 'range_high', q.range_high,
      'walkthrough_recommended', v_walk, 'send_customer_mail', v_mail);
  end if;
  return jsonb_build_object('status', 'ok', 'lead_id', v_lead, 'new_lead', v_new, 'send_customer_mail', false);
end $$;

-- close_walkthrough (D-319 2) --------------------------------------------------------------------------------------
create or replace function close_walkthrough(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  w walkthroughs;
  v_lead uuid;
  v_company text;
  v_missing int;
  v_version int;
  ls lead_sites;
  v_addr record;
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

  -- D-319 (2): la dirección del walkthrough pasa al sitio del lead si está incompleto o marcado para revisar.
  select * into ls from lead_sites where id = w.site_id for update;
  if ls.address_line1 is null or ls.address_needs_review then
    v_addr := walkthrough_address_parts(w.draft, null::lead_sites);
    if v_addr.line1 is not null then
      update lead_sites set address_line1 = v_addr.line1, address_line2 = v_addr.line2, city = v_addr.city,
             state = v_addr.state, zip = v_addr.zip
       where id = ls.id;
    end if;
  end if;

  select l.id, lead_display_name(l.company, l.contact_name) into v_lead, v_company
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

-- portal_decide (D-319 3) ------------------------------------------------------------------------------------------
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

-- Envío del quote y PDF del walkthrough: empresa o contacto; sitio con su dirección o "Naples, FL". -----------------
create or replace function send_quote_data(p_version uuid) returns jsonb
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
      'contact_name', nullif(btrim(j.contact_name), ''),
      'lines', v.lines, 'tax_rate', v.tax_rate, 'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total,
      'valid_days', v.valid_days, 'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to));
  end if;
  select * into l from leads where id = q.lead_id;
  select * into s from lead_sites where id = q.site_id;
  select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
  return jsonb_build_object(
    'version_id', v.id, 'quote_id', v.quote_id, 'version', quote_version_label(v.minor), 'language', l.language,
    'company', lead_display_name(l.company, l.contact_name), 'site', lead_site_label(s.name, s.address),
    'address', coalesce(nullif(btrim(wv.data->'contact'->>'address'), ''), s.address, 'Naples, FL'),
    'frequency', wv.data->'frequency', 'extra', false, 'service_date', null, 'lines', v.lines, 'tax_rate', v.tax_rate,
    'contact_name', coalesce(nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(l.contact_name), '')),
    'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total, 'valid_days', v.valid_days,
    'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to));
end $$;

create or replace function walkthrough_pdf_source(p_id uuid, p_version int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
begin
  if not can_see_walkthroughs() then
    raise exception 'No tienes permiso para ver walkthroughs' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'company', lead_display_name(l.company, l.contact_name),
           'site_name', nullif(btrim(s.name), ''),
           'site_address', s.address,
           'version', v.version,
           'closed_at', v.created_at,
           'data', v.data,
           'pdf_path', v.pdf_path,
           'photos', is_admin_role())
    into r
    from walkthrough_versions v
    join walkthroughs w on w.id = v.walkthrough_id
    join lead_sites s on s.id = w.site_id
    join leads l on l.id = s.lead_id
   where v.walkthrough_id = p_id and v.version = p_version;
  if r is null then
    raise exception 'La versión no existe' using errcode = 'P0002';
  end if;
  return r;
end $$;

-- Datos existentes ---------------------------------------------------------------------------------------------------

-- Sitios de leads web: "Ciudad, FL ZIP" (o "FL ZIP", "FL") en Dirección → City, State y ZIP; sin "Website …" de nombre.
update lead_sites s set address_line1 = null, address_line2 = null,
       city = nullif(btrim(x.m[1]), ''), state = 'FL', zip = x.m[2]
  from (select ls.id, regexp_match(coalesce(ls.address_line1, ''), '^(?:([^,0-9]+),\s*)?FL(?:\s+([0-9]{5}(?:-[0-9]{4})?))?$') m
          from lead_sites ls join leads l on l.id = ls.lead_id where l.source = 'web') x
 where x.id = s.id and x.m is not null;
update lead_sites s set name = null
  from leads l where l.id = s.lead_id and l.source = 'web' and s.name ~ '^Website (estimate|contact)$';
-- Jobsites que nacieron con ese nombre: toman su dirección.
update jobsites set name = coalesce(nullif(btrim(address), ''), 'Naples, FL') where name ~ '^Website (estimate|contact)$';

-- Leads web con el nombre de la persona como empresa: la empresa queda para completar. Teléfono como D-216.
update leads set company = null where source = 'web' and btrim(company) = btrim(coalesce(contact_name, ''));
update leads set phone = us_phone_format(phone) where source = 'web' and phone is not null;

-- Tipo, sq ft y frecuencia desde la solicitud que creó el lead (claves del estimador).
update lead_sites s set
       facility_type = coalesce(s.facility_type, (select x->>'key' from estimator_settings e, jsonb_array_elements(e.place_types) x
                                                   where x->>'name' = sub.type_name limit 1)),
       sqft = coalesce(s.sqft, sub.sqft),
       web_frequency = coalesce(s.web_frequency, (select x->>'key' from estimator_settings e, jsonb_array_elements(e.frequencies) x
                                                   where x->>'name' = sub.frequency_name limit 1))
  from (select distinct on (lead_id) lead_id, type_name, sqft, frequency_name
          from site_submissions where kind = 'estimate' and not attached and lead_id is not null
         order by lead_id, created_at) sub
 where sub.lead_id = s.lead_id
   and s.id = (select x.id from lead_sites x where x.lead_id = s.lead_id order by x.created_at, x.id limit 1);
