-- Orden 130 (D-332, D-333, D-334): flujo de leads automático.
-- En frío: Nuevo → Esperando respuesta (al abrir o copiar un correo de plantilla) → Follow up (7 días desde el
-- primer contacto) → Esperando → 2nd follow up (30 días desde el primer contacto) → Esperando → Sin respuesta
-- (14 días desde el último contacto, con aviso). "Respondió" pasa a Interesado en cualquier momento. Venta:
-- Walkthrough agendado, Walkthrough hecho, Quote enviado, Negociación, Ganado o Perdido (automáticos, ya existían;
-- aquí se generalizan con lead_stage para los estados nuevos). "Cambiar estado" a mano sigue con leads_editar.
-- Requiere 20261119000001_lead_estados.sql (valores nuevos del enum).

-- 1. Datos del seguimiento en el lead.
alter table leads
  add column first_contact_at timestamptz,
  add column last_contact_at  timestamptz,
  add column followups_sent   smallint not null default 0 check (followups_sent between 0 and 2),
  -- Fecha en que salió el Follow up (el primero), para la línea de tiempo del detail (D-200).
  add column followup_sent_at timestamptz,
  add column responded_at     timestamptz;

-- Etapa de un estado: 0 en frío, 1 Interesado, 2 a 5 la venta, 6 cerrado. Las transiciones de venta solo avanzan.
create function lead_stage(s lead_status) returns int
language sql immutable set search_path = public as $$
  select case s
    when 'new' then 0 when 'contacted' then 0 when 'waiting' then 0 when 'follow_up' then 0
    when 'follow_up_2' then 0 when 'no_response' then 0
    when 'interested' then 1 when 'walkthrough_scheduled' then 2 when 'walkthrough_done' then 3
    when 'quote_sent' then 4 when 'negotiation' then 5 else 6 end
$$;

-- Estado de seguimiento derivado (campo calculado de la API: `next_step_on`): el día del siguiente paso automático
-- mientras espera respuesta, o el día en que el paso venció (Follow up, 2nd follow up, Sin respuesta), para ordenar
-- lo más atrasado primero (D-200). Nulo fuera del frío.
create function next_step_on(l leads) returns date
language sql stable set search_path = public as $$
  select case
    when l.status = 'waiting' and l.followups_sent = 0 then local_day(l.first_contact_at) + 7
    when l.status = 'waiting' and l.followups_sent = 1 then local_day(l.first_contact_at) + 30
    when l.status = 'waiting' and l.followups_sent = 2 then local_day(l.last_contact_at) + 14
    when l.status in ('follow_up', 'follow_up_2', 'no_response') then local_day(l.status_changed_at)
  end
$$;

-- 2. Datos existentes (sin historial: es una migración, no un cambio de nadie).
--    Contactado → Esperando con primer contacto = fecha del cambio de estado (D-334: los 3 leads del 2026-11-18
--    quedan esperando con Follow up el 2026-11-25). Lead web en Nuevo → Interesado. El resto igual.
alter table leads disable trigger user;
update leads set status = 'waiting', first_contact_at = status_changed_at, last_contact_at = status_changed_at
 where status = 'contacted';
update leads set status = 'interested' where status = 'new' and source = 'web';
alter table leads enable trigger user;

-- 3. Al escribir el estado: Esperando siempre con primer contacto (corrección a mano, D-200).
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
  return new;
end $$;

-- 4. Correo de plantilla (abrir o copiar): mueve el lead en frío. Nuevo → Esperando (primer contacto); Follow up →
--    Esperando (1 seguimiento enviado); 2nd follow up → Esperando (2). Siempre actualiza el último contacto.
--    No toca leads en venta.
create or replace function log_template_email(p_template uuid, p_kind text, p_id uuid, p_via text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  t email_templates;
  v_id bigint;
begin
  if current_profile_id() is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if p_via is null or p_via not in ('open', 'copy') then raise exception 'Acción no válida' using errcode = '22023'; end if;
  select * into t from email_templates where id = p_template;
  if t.id is null or not t.active then raise exception 'La plantilla no existe' using errcode = 'P0002'; end if;
  if p_kind = 'lead' then
    if not has_permission('leads_ver') then raise exception 'No tienes permiso para ver leads' using errcode = '42501'; end if;
    if t.audience <> 'prospect' then raise exception 'La plantilla no es para prospectos' using errcode = '22023'; end if;
    if not exists (select 1 from leads where id = p_id) then raise exception 'El lead no existe' using errcode = 'P0002'; end if;
  elsif p_kind = 'client' then
    if not has_permission('clientes_ver') then raise exception 'No tienes permiso para ver clientes' using errcode = '42501'; end if;
    if t.audience <> 'client' then raise exception 'La plantilla no es para clientes' using errcode = '22023'; end if;
    if not exists (select 1 from clients where id = p_id) then raise exception 'El cliente no existe' using errcode = 'P0002'; end if;
  else
    raise exception 'Tipo no válido' using errcode = '22023';
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'correo_plantilla', case p_kind when 'lead' then 'leads' else 'clients' end, p_id,
          jsonb_build_object('template_id', t.id, 'plantilla', t.name, 'kind', p_via))
  returning id into v_id;
  if p_kind = 'lead' then
    update leads l set
      status = case when l.status in ('new', 'contacted', 'follow_up', 'follow_up_2') then 'waiting'::lead_status else l.status end,
      first_contact_at = case when l.status in ('new', 'contacted') or l.first_contact_at is null then now() else l.first_contact_at end,
      followups_sent = case l.status when 'follow_up' then 1 when 'follow_up_2' then 2 else l.followups_sent end,
      followup_sent_at = case when l.status = 'follow_up' then now() else l.followup_sent_at end,
      last_contact_at = now()
     where l.id = p_id and lead_stage(l.status) = 0;
  end if;
  return v_id;
end $$;

-- 5. Plazos (los corre notifications_scan, cron `cidclean-avisos`, cada 15 minutos). Días en hora de Naples.
create function lead_followups_advance(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (p_now at time zone cc_tz())::date;
  n int := 0;
  c int;
  r record;
begin
  update leads set status = 'follow_up'
   where status = 'waiting' and followups_sent = 0 and first_contact_at is not null
     and local_day(first_contact_at) + 7 <= v_today;
  get diagnostics c = row_count; n := n + c;
  update leads set status = 'follow_up_2'
   where status = 'waiting' and followups_sent = 1 and first_contact_at is not null
     and local_day(first_contact_at) + 30 <= v_today;
  get diagnostics c = row_count; n := n + c;
  for r in
    update leads set status = 'no_response'
     where status = 'waiting' and followups_sent = 2 and last_contact_at is not null
       and local_day(last_contact_at) + 14 <= v_today
    returning id, company, contact_name
  loop
    n := n + 1;
    -- Aviso "Seguimiento de lead pendiente" (D-158, tabla de notificaciones) a quien ve leads.
    perform notify_permission(array['leads_ver'], 'followup_due',
      jsonb_build_object('company', lead_display_name(r.company, r.contact_name), 'day', v_today),
      jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', r.id)), true,
      'nr:' || r.id || ':' || v_today);
  end loop;
  return n;
end $$;

-- 6. "Respondió": Interesado y se detienen los seguimientos. Un lead en venta no cambia.
create function lead_mark_responded(p_id uuid) returns lead_status
language plpgsql security definer set search_path = public as $$
declare
  v lead_status;
begin
  if not has_permission('leads_editar') then raise exception 'No tienes permiso para editar leads' using errcode = '42501'; end if;
  select status into v from leads where id = p_id for update;
  if v is null then raise exception 'El lead no existe' using errcode = 'P0002'; end if;
  if lead_stage(v) = 0 then
    update leads set status = 'interested', responded_at = now() where id = p_id;
    v := 'interested';
  end if;
  return v;
end $$;

-- 7. Sin respuesta: "Marcar perdido (Sin respuesta)" o "Reintentar" (vuelve a Follow up y empieza otra ronda:
--    el primer contacto pasa a hoy, así el 2nd follow up cae a los 30 días y no al momento, D-200).
create function lead_no_response_decide(p_id uuid, p_action text) returns lead_status
language plpgsql security definer set search_path = public as $$
declare
  v lead_status;
  v_reason uuid;
begin
  if not has_permission('leads_editar') then raise exception 'No tienes permiso para editar leads' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('lost', 'retry') then raise exception 'Acción no válida' using errcode = '22023'; end if;
  select status into v from leads where id = p_id for update;
  if v is null then raise exception 'El lead no existe' using errcode = 'P0002'; end if;
  if v <> 'no_response' then raise exception 'El lead no está en Sin respuesta' using errcode = '22023'; end if;
  if p_action = 'lost' then
    select id into v_reason from lost_reasons where label_es = 'Sin respuesta' and active order by sort limit 1;
    if v_reason is null then raise exception 'El motivo Sin respuesta no está disponible' using errcode = 'P0002'; end if;
    update leads set status = 'lost', lost_reason_id = v_reason where id = p_id;
    return 'lost';
  end if;
  update leads set status = 'follow_up', followups_sent = 0, followup_sent_at = null, first_contact_at = now()
   where id = p_id;
  return 'follow_up';
end $$;

-- 8. Inicio (D-333 (4)): a cuántos toca escribir hoy, cuántos esperan respuesta y cuántos quedaron sin respuesta.
create function home_leads_followup() returns table (to_write int, waiting int, no_response int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('leads_ver') then raise exception 'No tienes permiso para ver leads' using errcode = '42501'; end if;
  return query select
    (count(*) filter (where status in ('follow_up', 'follow_up_2')))::int,
    (count(*) filter (where status = 'waiting'))::int,
    (count(*) filter (where status = 'no_response'))::int
  from leads;
end $$;

revoke all on function lead_followups_advance(timestamptz) from public, anon, authenticated;
grant execute on function lead_followups_advance(timestamptz) to service_role;
revoke all on function lead_mark_responded(uuid), lead_no_response_decide(uuid, text), home_leads_followup() from public, anon;
grant execute on function lead_mark_responded(uuid), lead_no_response_decide(uuid, text), home_leads_followup() to authenticated, service_role;
revoke all on function next_step_on(leads), lead_stage(lead_status) from public, anon;
grant execute on function next_step_on(leads), lead_stage(lead_status) to authenticated, service_role;

-- 9. Transiciones de venta con los estados nuevos (sin retroceder un lead más avanzado), lead web directo a
--    Interesado (D-333 (2)) y los plazos dentro del barrido de avisos. Cuerpos iguales a su última versión salvo
--    la condición del estado.
CREATE OR REPLACE FUNCTION public.schedule_walkthrough(p_site uuid, p_starts_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_lead uuid;
  v_id uuid;
begin
  if not has_permission('leads_editar') then
    raise exception 'No tienes permiso para agendar walkthroughs' using errcode = '42501';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'La cita debe ser en el futuro' using errcode = '22023';
  end if;
  select lead_id into v_lead from lead_sites where id = p_site;
  if v_lead is null then
    raise exception 'El sitio no existe' using errcode = 'P0002';
  end if;

  update walkthrough_appointments set starts_at = p_starts_at
   where site_id = p_site and status = 'scheduled'
  returning id into v_id;
  if v_id is null then
    insert into walkthrough_appointments (site_id, starts_at) values (p_site, p_starts_at) returning id into v_id;
  end if;

  update leads set status = 'walkthrough_scheduled' where id = v_lead and lead_stage(status) < 2;
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.close_walkthrough(p_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     where id = v_lead and lead_stage(status) < 3;
  end if;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), case when v_version = 1 then 'walkthrough_cerrado' else 'walkthrough_corregido' end,
          'walkthroughs', p_id, jsonb_build_object('company', v_company, 'site_id', w.site_id, 'version', v_version));
  return v_version;
end $function$
;
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
  v_token := quote_new_token();
  v_expires := now() + make_interval(days => least(v.valid_days, 30));
  -- Una versión nueva reemplaza a la anterior (D-209).
  update quote_versions set status = 'superseded'
   where quote_id = v.quote_id and id <> v.id and (status in ('sent', 'viewed', 'changes_requested', 'expired')
          or (status = 'accepted' and quote_needs_update(v.quote_id)));
  -- B5: solo el hash; el token sale una vez hacia send-quote para armar el enlace del correo.
  update quote_versions
     set status = 'sent', sent_at = now(), sent_by = p_actor, expires_at = v_expires,
         public_token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
         pdf_path = p_pdf_path, snapshot = p_snapshot
   where id = v.id;
  update leads set status = 'quote_sent'
   where id = q.lead_id and lead_stage(status) < 4;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'quote_enviado', 'quotes', q.id, jsonb_build_object('version', quote_version_label(v.minor)));
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end $function$
;
CREATE OR REPLACE FUNCTION public.site_submit(p_kind text, p_name text, p_company text, p_email text, p_phone text, p_city text, p_zip text, p_type text, p_sqft integer, p_frequency text, p_message text, p_ip_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    values (v_company, v_name, us_phone_format(p_phone), v_email, 'web', 'interested', 'non_residential', v_note)
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
end $function$
;

CREATE OR REPLACE FUNCTION public.notifications_scan()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int := 0;
  r record;
  v_today date := cc_today();
  v_sunday date := week_monday(cc_today());
begin
  perform expire_quotes();
  -- Orden 130 (D-333): plazos del flujo de leads (Follow up, 2nd follow up y Sin respuesta con aviso).
  perform lead_followups_advance();

  for r in
    select v.id, v.starts_at, j.name jobsite, s.profile_id from visits v join jobsites j on j.id = v.jobsite_id join visit_staff s on s.visit_id = v.id
     where not v.removed and v.starts_at > now() and v.starts_at <= now() + interval '2 hours'
  loop
    n := n + notify_profiles(array[r.profile_id], 'visit_soon', jsonb_build_object('jobsite', r.jobsite, 'time', cc_time(r.starts_at)),
                             jsonb_build_object('pathname', '/'), false, 'soon:' || r.id);
  end loop;

  for r in
    select v.id, j.name jobsite, p.full_name, s.profile_id from visit_staff s join visits v on v.id = s.visit_id
      join jobsites j on j.id = v.jobsite_id join profiles p on p.id = s.profile_id
     where not v.removed and v.local_date = v_today and v.starts_at + interval '30 minutes' <= now()
       and not s.no_show and p.has_app_access and p.worker_type is distinct from '1099'
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id)
  loop
    n := n + notify_permission(array['work_registrar_por_otros'], 'clock_in_forgotten', jsonb_build_object('jobsite', r.jobsite, 'name', r.full_name),
                               jsonb_build_object('pathname', '/schedule', 'params', jsonb_build_object('tab', 'schedule')), false,
                               'cin:' || r.id || ':' || r.profile_id);
  end loop;

  for r in
    select w.id, j.name jobsite, p.full_name, v.local_date from work_entries w join visits v on v.id = w.visit_id
      join jobsites j on j.id = v.jobsite_id join profiles p on p.id = w.profile_id
     where w.clock_out is null
       -- D-245: 30 minutos después de que termina la visita (un turno de noche cruza la medianoche).
       and v.starts_at + make_interval(mins => v.minutes) + interval '30 minutes' <= now()
  loop
    n := n + notify_permission(array['work_editar'], 'clock_out_forgotten', jsonb_build_object('jobsite', r.jobsite, 'name', r.full_name, 'day', r.local_date),
                               jsonb_build_object('pathname', '/schedule', 'params', jsonb_build_object('tab', 'approve')), false, 'cout:' || r.id);
  end loop;

  for r in
    select v.id, v.status, v.expires_at, q.kind, q.lead_id, q.jobsite_id,
           coalesce(l.company, c.name) company, coalesce(nullif(btrim(s.name), ''), s.address, j.name) site
      from quote_versions v join quotes q on q.id = v.quote_id
      left join leads l on l.id = q.lead_id left join lead_sites s on s.id = q.site_id
      left join jobsites j on j.id = q.jobsite_id left join clients c on c.id = j.client_id
     where (v.status in ('sent', 'viewed') and v.expires_at <= now() + interval '3 days')
        or (v.status = 'expired' and v.expires_at > now() - interval '2 days')
  loop
    n := n + notify_permission(array['quotes_ver'], case when r.status = 'expired' then 'quote_expired' else 'quote_expiring' end,
      jsonb_build_object('company', r.company, 'site', r.site, 'day', local_day(r.expires_at)),
      case when r.kind = 'extra' then jsonb_build_object('pathname', '/jobsites/[id]', 'params', jsonb_build_object('id', r.jobsite_id))
           else jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', r.lead_id)) end,
      true, (case when r.status = 'expired' then 'qexpd:' else 'qexp:' end) || r.id);
  end loop;

  for r in
    select f.id, f.due_on, f.lead_id, l.company from lead_followups f join leads l on l.id = f.lead_id
     where f.done_at is null and f.due_on <= v_today and l.status not in ('won', 'lost')
  loop
    n := n + notify_permission(array['leads_ver'], 'followup_due', jsonb_build_object('company', r.company, 'day', r.due_on),
      jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', r.lead_id)), true, 'fu:' || r.id || ':' || r.due_on);
  end loop;

  for r in
    select v.id, j.name jobsite, v.local_date from visits v join jobsites j on j.id = v.jobsite_id
     where (v.approved_at is null and exists (select 1 from work_entries w where w.visit_id = v.id)
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.clock_out is null))
        or exists (select 1 from service_days d where d.visit_id = v.id and d.status = 'pending')
  loop
    n := n + notify_permission(array['work_aprobar'], 'work_to_approve', jsonb_build_object('jobsite', r.jobsite, 'day', r.local_date),
      jsonb_build_object('pathname', '/schedule/work/[id]', 'params', jsonb_build_object('id', r.id)), true, 'appr:' || r.id);
  end loop;

  for r in
    select j.id, j.name from jobsites j, lateral jobsite_margin_calc(j.id) m
     where j.status = 'active' and m.rate is not null and m.cost > 0 and m.cost >= m.rate
  loop
    n := n + notify_permission(array['clientes_ver_tarifa'], 'margin_alert', jsonb_build_object('jobsite', r.name),
      jsonb_build_object('pathname', '/jobsites/[id]', 'params', jsonb_build_object('id', r.id)), false,
      'margin:' || r.id || ':' || month_start(v_today));
  end loop;

  for r in
    select p.id, p.full_name, wk.sunday, programmed_minutes(p.id, wk.sunday) mins
      from profiles p, (values (v_sunday), (v_sunday + 7)) wk(sunday)
     where p.active and not p.is_super_admin and programmed_minutes(p.id, wk.sunday) >= 28 * 60
  loop
    n := n + notify_permission(array['schedule_ver_editar'], 'hours_32',
      jsonb_build_object('name', r.full_name, 'hours', trim(to_char(round(r.mins / 60.0, 2), 'FM990.99'), '.')),
      jsonb_build_object('pathname', '/schedule'), false, 'h32:' || r.id || ':' || r.sunday);
  end loop;

  if v_today = month_end(v_today) and extract(hour from now() at time zone cc_tz()) >= 8 then
    perform generate_accounting();
    if (select count(*) from income_expected e where e.month = month_start(v_today) and not e.received) > 0 then
      n := n + notify_permission(array['ingresos_marcar_recibidos', 'clientes_ver_tarifa'], 'income_unmarked',
        jsonb_build_object('month', month_start(v_today),
                           'count', (select count(*) from income_expected e where e.month = month_start(v_today) and not e.received)),
        jsonb_build_object('pathname', '/accounting/income',
                           'params', jsonb_build_object('from', to_char(v_today, 'YYYY-MM'), 'to', to_char(v_today, 'YYYY-MM'))),
        false, 'inc:' || month_start(v_today));
    end if;
  end if;
  return n;
end $function$
;
