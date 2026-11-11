-- Orden 100 (N1 de la revisión de seguridad n.º 2): que site-estimate no sirva para mandar correos a terceros.
-- - El correo cuenta normalizado (minúsculas, sin "+etiqueta" y, en gmail.com/googlemail.com, sin puntos): 3 por hora (D-311).
-- - La IP llega ya como hash del /64 en IPv6 (la Edge Function lo calcula). Sin IP: un balde común "sin IP" con un tope de
--   5 por hora (D-200), en vez de saltarse el límite.
-- - Tope global: como máximo 40 correos al cliente por hora en total (D-200). Por encima, el lead se crea igual y el aviso
--   interno sale, pero el correo al cliente no; queda anotado.
-- - El nombre se recorta a 60 caracteres (D-200).
-- - Sin carreras: un bloqueo de transacción (pg_advisory_xact_lock) antes de contar; el conteo y el registro del envío
--   ocurren dentro de la misma transacción y bajo el mismo bloqueo.

create function site_email_key(p_email text) returns text
language sql immutable set search_path = public as $$
  with e as (select lower(btrim(coalesce(p_email, ''))) as v),
       p as (select split_part(v, '@', 1) as l, substr(v, length(split_part(v, '@', 1)) + 2) as d from e)
  select case
           when position('@' in (select v from e)) = 0 then (select v from e)
           when d in ('gmail.com', 'googlemail.com') then replace(split_part(l, '+', 1), '.', '') || '@gmail.com'
           else split_part(l, '+', 1) || '@' || d
         end
  from p
$$;
revoke execute on function site_email_key(text) from public, anon, authenticated;

alter table site_submissions
  add column email_key     text,
  add column customer_mail boolean not null default false;
update site_submissions set email_key = site_email_key(email);
alter table site_submissions alter column email_key set not null;
create index site_submissions_email_key on site_submissions (email_key, created_at desc);
create index site_submissions_customer_mail on site_submissions (created_at desc) where customer_mail;
create index site_submissions_sin_ip on site_submissions (created_at desc) where ip_hash is null;

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

  -- Mismo correo con un lead abierto: se agrega la nota (D-200).
  select id into v_lead from leads
   where lower(email) = v_email and status not in ('won', 'lost')
   order by created_at desc limit 1;
  if v_lead is not null then
    update leads set notes = case when coalesce(notes, '') = '' then v_note else notes || E'\n\n' || v_note end
     where id = v_lead;
  else
    insert into leads (company, contact_name, phone, email, source, status, cleaning_type, notes)
    values (coalesce(v_company, v_name), v_name, btrim(p_phone), v_email, 'web', 'new', 'non_residential', v_note)
    returning id into v_lead;
    v_new := true;
    -- Sitio del lead (D-301): sin calle, la línea queda para completar en el walkthrough.
    insert into lead_sites (lead_id, name, address)
    values (v_lead, 'Website ' || p_kind,
            concat_ws(', ', nullif(v_city, 'Other'), concat_ws(' ', 'FL', v_zip)));
  end if;

  insert into site_submissions (kind, ip_hash, email, email_key, customer_mail, lead_id)
  values (p_kind, p_ip_hash, v_email, v_key, v_mail, v_lead);

  if p_kind = 'estimate' then
    return jsonb_build_object('status', 'ok', 'lead_id', v_lead, 'new_lead', v_new,
      'type_name', t->>'name', 'frequency_name', f->>'name',
      'per_visit', q.per_visit, 'monthly', q.monthly, 'range_low', q.range_low, 'range_high', q.range_high,
      'walkthrough_recommended', v_walk, 'send_customer_mail', v_mail);
  end if;
  return jsonb_build_object('status', 'ok', 'lead_id', v_lead, 'new_lead', v_new, 'send_customer_mail', false);
end $$;
