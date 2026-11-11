-- Orden 91: estimador del sitio cidclean.com (D-307, D-309, D-310).
-- estimator_settings: una sola fila con las tarifas vigentes; solo el Super Admin la lee y la cambia (D-014, D-309 (4);
-- is_super_admin() ya exige aal2, D-306). estimate_quote(): la fórmula pura. site_submit(): lo que llama la Edge
-- Function pública site-estimate con la service role (límite por IP y por correo, cálculo y lead).

-- Tarifas ------------------------------------------------------------------------------------------------------------
create table estimator_settings (
  id               boolean primary key default true check (id),
  -- [{key, name, rate}] — rate en $ por sq ft por visita.
  place_types      jsonb not null,
  -- [{key, name, visits_per_month, adjustment}]
  frequencies      jsonb not null,
  min_per_visit    numeric(10, 2) not null check (min_per_visit > 0 and min_per_visit <= 10000),
  range_pct        numeric(5, 4)  not null check (range_pct >= 0 and range_pct < 1),
  round_to         integer        not null check (round_to between 1 and 1000),
  walkthrough_sqft integer        not null check (walkthrough_sqft between 1000 and 1000000),
  updated_by       uuid references profiles(id),
  updated_at       timestamptz not null default now()
);

-- Forma de las listas: claves fijas (el sitio las usa), nombres no vacíos y números en rango.
create function estimator_settings_check() returns trigger
language plpgsql set search_path = public as $$
declare
  e jsonb;
  keys text[] := '{}';
begin
  if jsonb_typeof(new.place_types) <> 'array' or jsonb_array_length(new.place_types) = 0
     or jsonb_typeof(new.frequencies) <> 'array' or jsonb_array_length(new.frequencies) = 0 then
    raise exception 'estimator_settings: listas vacías' using errcode = '22023';
  end if;
  for e in select * from jsonb_array_elements(new.place_types) loop
    if coalesce(e->>'key', '') !~ '^[a-z0-9_]{1,40}$' or btrim(coalesce(e->>'name', '')) = ''
       or length(e->>'name') > 60 or jsonb_typeof(e->'rate') <> 'number'
       or (e->>'rate')::numeric <= 0 or (e->>'rate')::numeric > 5 or (e->>'key') = any(keys) then
      raise exception 'estimator_settings: tipo inválido %', e using errcode = '22023';
    end if;
    keys := keys || (e->>'key');
  end loop;
  keys := '{}';
  for e in select * from jsonb_array_elements(new.frequencies) loop
    if coalesce(e->>'key', '') !~ '^[a-z0-9_]{1,40}$' or btrim(coalesce(e->>'name', '')) = ''
       or length(e->>'name') > 60 or jsonb_typeof(e->'visits_per_month') <> 'number'
       or jsonb_typeof(e->'adjustment') <> 'number'
       or (e->>'visits_per_month')::numeric <= 0 or (e->>'visits_per_month')::numeric > 31
       or (e->>'adjustment')::numeric <= 0 or (e->>'adjustment')::numeric > 5 or (e->>'key') = any(keys) then
      raise exception 'estimator_settings: frecuencia inválida %', e using errcode = '22023';
    end if;
    keys := keys || (e->>'key');
  end loop;
  -- Las claves no cambian (el sitio y los leads las usan); solo nombres y números.
  if tg_op = 'UPDATE' then
    if (select array_agg(x->>'key' order by x->>'key') from jsonb_array_elements(new.place_types) x)
       is distinct from (select array_agg(x->>'key' order by x->>'key') from jsonb_array_elements(old.place_types) x)
       or (select array_agg(x->>'key' order by x->>'key') from jsonb_array_elements(new.frequencies) x)
       is distinct from (select array_agg(x->>'key' order by x->>'key') from jsonb_array_elements(old.frequencies) x) then
      raise exception 'estimator_settings: las claves no se cambian' using errcode = '22023';
    end if;
    new.updated_by := current_profile_id();
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger estimator_settings_check before insert or update on estimator_settings
  for each row execute function estimator_settings_check();

-- Tarifas exactas de D-309 (3).
insert into estimator_settings (place_types, frequencies, min_per_visit, range_pct, round_to, walkthrough_sqft) values (
  '[{"key":"office","name":"Office","rate":0.040},
    {"key":"medical","name":"Medical / dental office","rate":0.065},
    {"key":"retail","name":"Retail / showroom","rate":0.045},
    {"key":"warehouse","name":"Warehouse","rate":0.020},
    {"key":"light_industrial","name":"Light industrial","rate":0.050},
    {"key":"gym","name":"Gym / fitness","rate":0.055},
    {"key":"other","name":"Other commercial","rate":0.045}]',
  '[{"key":"monthly","name":"Monthly","visits_per_month":1,"adjustment":1.25},
    {"key":"biweekly","name":"Every 2 weeks","visits_per_month":2.17,"adjustment":1.10},
    {"key":"weekly_1","name":"1x per week","visits_per_month":4.33,"adjustment":1.00},
    {"key":"weekly_2","name":"2x per week","visits_per_month":8.67,"adjustment":0.92},
    {"key":"weekly_3","name":"3x per week","visits_per_month":13,"adjustment":0.85},
    {"key":"weekly_5","name":"5x per week","visits_per_month":21.67,"adjustment":0.75}]',
  85, 0.15, 10, 25000);

alter table estimator_settings enable row level security;
revoke all on estimator_settings from anon, authenticated;
grant select, update on estimator_settings to authenticated;
-- Configuración general: solo el Super Admin (D-014). Sin insert ni delete: la fila es única.
create policy estimator_settings_read on estimator_settings for select to authenticated using (is_super_admin());
create policy estimator_settings_update on estimator_settings for update to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- Historial (D-125): cada cambio de tarifas.
create function log_estimator_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'estimador_tarifas_cambiadas', 'estimator_settings', null,
          jsonb_build_object('antes', to_jsonb(old) - 'updated_by' - 'updated_at', 'despues', to_jsonb(new) - 'updated_by' - 'updated_at'));
  return new;
end $$;
revoke execute on function log_estimator_settings() from public, anon, authenticated;
create trigger estimator_settings_log after update on estimator_settings for each row execute function log_estimator_settings();

-- Fórmula (D-309): por visita = max(mínimo, sq ft × tarifa × ajuste); mes = por visita × visitas;
-- rango = mes × (1 ± rango) redondeado al múltiplo de round_to. Pura: no lee tablas.
create function estimate_quote(p_sqft numeric, p_rate numeric, p_visits numeric, p_adjustment numeric,
                               p_min numeric, p_range numeric, p_round integer,
                               out per_visit numeric, out monthly numeric, out range_low numeric, out range_high numeric)
language sql immutable set search_path = public as $$
  with v as (select greatest(p_min, p_sqft * p_rate * p_adjustment) as pv)
  select round(v.pv, 2),
         round(v.pv * p_visits, 2),
         round(v.pv * p_visits * (1 - p_range) / p_round) * p_round,
         round(v.pv * p_visits * (1 + p_range) / p_round) * p_round
  from v
$$;

-- Envíos del sitio: solo para el límite por IP (hash con pimienta) y por correo. Nadie de la API los lee.
create table site_submissions (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('estimate', 'contact')),
  ip_hash    text,
  email      text not null,
  lead_id    uuid references leads(id) on delete set null,
  created_at timestamptz not null default now()
);
create index site_submissions_ip on site_submissions (ip_hash, created_at desc);
create index site_submissions_email on site_submissions (email, created_at desc);
alter table site_submissions enable row level security;
revoke all on site_submissions from anon, authenticated;

-- Lo llama solo site-estimate (service role). Valida, limita, calcula con las tarifas vigentes y crea el lead
-- (o agrega la nota al lead abierto del mismo correo, D-200). Devuelve status: ok | invalid | rate_limited.
create function site_submit(p_kind text, p_name text, p_company text, p_email text, p_phone text, p_city text,
                            p_zip text, p_type text, p_sqft integer, p_frequency text, p_message text, p_ip_hash text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s estimator_settings;
  t jsonb;
  f jsonb;
  q record;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_city text := btrim(coalesce(p_city, ''));
  v_zip text := nullif(btrim(coalesce(p_zip, '')), '');
  v_note text;
  v_lead uuid;
  v_new boolean := false;
  v_walk boolean := false;
  v_when text := to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI');
begin
  -- Validación (la Edge Function valida antes; esto es la red de seguridad).
  if p_kind not in ('estimate', 'contact') or v_name = '' or length(v_name) > 100
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

  -- Límite (D-200): 5 por hora por IP y 3 por hora por correo.
  if (p_ip_hash is not null and (select count(*) from site_submissions
        where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5)
     or (select count(*) from site_submissions where email = v_email and created_at > now() - interval '1 hour') >= 3 then
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

  insert into site_submissions (kind, ip_hash, email, lead_id) values (p_kind, p_ip_hash, v_email, v_lead);

  if p_kind = 'estimate' then
    return jsonb_build_object('status', 'ok', 'lead_id', v_lead, 'new_lead', v_new,
      'type_name', t->>'name', 'frequency_name', f->>'name',
      'per_visit', q.per_visit, 'monthly', q.monthly, 'range_low', q.range_low, 'range_high', q.range_high,
      'walkthrough_recommended', v_walk);
  end if;
  return jsonb_build_object('status', 'ok', 'lead_id', v_lead, 'new_lead', v_new);
end $$;

revoke all on function site_submit(text, text, text, text, text, text, text, text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function site_submit(text, text, text, text, text, text, text, text, integer, text, text, text)
  to service_role;
revoke execute on function estimator_settings_check() from public, anon, authenticated;
