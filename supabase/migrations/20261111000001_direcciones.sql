-- Orden 76 (D-301): direcciones con la misma composición en toda la app. Dirección (calle), Dirección 2, City, State
-- (50 estados + DC) y ZIP code (5 o 5+4), como el perfil del empleado (D-264, 20261030000004). Se muestran en una
-- línea "calle, dirección 2, City, ST ZIP" (format_address, igual que lib/address.ts y _shared/address.ts).
--
-- lead_sites, clients y jobsites reciben las columnas separadas. La columna `address` se queda como compatibilidad
-- (la leen las funciones de quotes, correos, PDFs, contrato y avisos): un disparador la arma con format_address cuando
-- cambian las partes, y si alguien escribe solo `address` (apps instaladas sin actualizar, funciones que copian la
-- dirección del sitio al jobsite) la separa con parse_us_address. Si no se reconocen ciudad, estado y ZIP, el texto
-- queda en Dirección y la fila se marca `address_needs_review` (la app muestra "Completa la dirección").
-- El walkthrough (data->contact), el W-9 (líneas 5 y 6) y los campos del contrato y del ICA siguen guardando el texto
-- en una línea; la app los separa y los vuelve a unir con las mismas reglas (lib/address.ts), sin tocar versiones
-- cerradas ni documentos firmados.

-- Validaciones comunes (las mismas del perfil del empleado) -------------------------------------------------------

create function us_state_codes() returns text[]
language sql immutable as $$
  select array['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX',
    'UT','VT','VA','WA','WV','WI','WY']
$$;

create function is_us_state(p text) returns boolean
language sql immutable as $$ select p is null or p = any (us_state_codes()) $$;

create function is_us_zip(p text) returns boolean
language sql immutable as $$ select p is null or p ~ '^[0-9]{5}(-[0-9]{4})?$' $$;

-- Una línea: "calle, dirección 2, City, ST ZIP" con lo que haya; null si no hay nada.
create function format_address(p_line1 text, p_line2 text, p_city text, p_state text, p_zip text) returns text
language sql immutable as $$
  select nullif(concat_ws(', ',
    nullif(btrim(coalesce(p_line1, '')), ''),
    nullif(btrim(coalesce(p_line2, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(concat_ws(' ', nullif(btrim(coalesce(p_state, '')), ''), nullif(btrim(coalesce(p_zip, '')), '')), '')), '')
$$;

-- Separa un texto libre. Solo separa si reconoce ciudad, estado (de la lista) y ZIP (D-301); si no, todo va a line1
-- y ok = false. "1250 Pine Ridge Rd Suite 202, Naples, FL 34108" → 1250 Pine Ridge Rd | Suite 202 | Naples | FL | 34108.
create function parse_us_address(p text, out line1 text, out line2 text, out city text, out state text, out zip text,
                                 out ok boolean)
language plpgsql immutable as $$
declare
  t text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
  m text[];
  street text;
  u text[];
begin
  ok := false;
  if t = '' then return; end if;
  t := regexp_replace(t, ',?\s*(USA|U\.S\.A\.|US|United States)\.?$', '', 'i');
  m := regexp_match(t, '^(.+),\s*([^,0-9][^,]*?)\s*,?\s+([A-Za-z]{2}|Florida)\.?(?:\s*,?\s*([0-9]{5}(-[0-9]{4})?))?$', 'i');
  if m is not null then
    state := case when lower(m[3]) = 'florida' then 'FL' else upper(m[3]) end;
    street := btrim(m[1]);
    city := btrim(m[2]);
    zip := m[4];
    if state = any (us_state_codes()) and street <> '' and city <> '' and length(city) <= 80 then
      if position(',' in street) > 0 then
        line1 := btrim(split_part(street, ',', 1));
        line2 := nullif(btrim(substr(street, position(',' in street) + 1)), '');
      else
        u := regexp_match(street, '^(.*\S)\s+((suite|ste|apt|apartment|unit|bldg|building|floor|fl|room|rm)\.?\s*\S.*|#\s*\S.*)$', 'i');
        if u is not null and u[1] ~ '[A-Za-z]' then
          line1 := u[1]; line2 := u[2];
        else
          line1 := street;
        end if;
      end if;
      if line1 <> '' and length(line1) <= 120 and coalesce(length(line2), 0) <= 120 then
        -- Sin ZIP: se separan calle, ciudad y estado, pero queda para revisar (solo falta el ZIP).
        ok := zip is not null;
        return;
      end if;
    end if;
  end if;
  line1 := left(t, 120); line2 := null; city := null; state := null; zip := null;
end $$;

-- Columnas -------------------------------------------------------------------------------------------------------

alter table lead_sites
  add column address_line1 text check (address_line1 is null or length(address_line1) <= 120),
  add column address_line2 text check (address_line2 is null or length(address_line2) <= 120),
  add column city text check (city is null or length(city) <= 80),
  add column state text check (is_us_state(state)),
  add column zip text check (is_us_zip(zip)),
  add column address_needs_review boolean not null default false;

alter table clients
  add column address_line1 text check (address_line1 is null or length(address_line1) <= 120),
  add column address_line2 text check (address_line2 is null or length(address_line2) <= 120),
  add column city text check (city is null or length(city) <= 80),
  add column state text check (is_us_state(state)),
  add column zip text check (is_us_zip(zip)),
  add column address_needs_review boolean not null default false;

alter table jobsites
  add column address_line1 text check (address_line1 is null or length(address_line1) <= 120),
  add column address_line2 text check (address_line2 is null or length(address_line2) <= 120),
  add column city text check (city is null or length(city) <= 80),
  add column state text check (is_us_state(state)),
  add column zip text check (is_us_zip(zip)),
  add column address_needs_review boolean not null default false;

-- Disparador común: partes → address, o address → partes. ----------------------------------------------------------

create function address_parts_sync() returns trigger
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
    -- Sin calle no hay dirección: Dirección 2, City, State y ZIP sueltos no se guardan (el State por defecto FL
    -- de un formulario vacío no debe aparecer como dirección).
    new.address_line2 := null; new.city := null; new.state := null; new.zip := null;
  end if;

  if tg_op = 'INSERT' then
    parts_changed := new.address_line1 is not null;
  else
    parts_changed := (new.address_line1, new.address_line2, new.city, new.state, new.zip)
                     is distinct from (old.address_line1, old.address_line2, old.city, old.state, old.zip);
  end if;

  if parts_changed or (tg_op = 'UPDATE' and new.address_line1 is null and old.address_line1 is not null
                       and new.address is not distinct from old.address) then
    new.address := format_address(new.address_line1, new.address_line2, new.city, new.state, new.zip);
  elsif tg_op = 'INSERT' or new.address is distinct from old.address then
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

  new.address_needs_review := new.address_line1 is not null
    and (new.city is null or new.state is null or new.zip is null);
  return new;
end $$;
revoke execute on function address_parts_sync() from public, anon, authenticated;

-- Migración de datos antes de crear el disparador: cada texto se separa una vez; si se reconoce, la línea queda
-- normalizada con format_address; si no, el texto original se conserva y la fila queda para revisar.
update lead_sites x set (address, address_line1, address_line2, city, state, zip, address_needs_review) = (
    select case when r.ok then format_address(r.line1, r.line2, r.city, r.state, r.zip) else x.address end,
           r.line1, r.line2, r.city, r.state, r.zip, not r.ok
      from parse_us_address(x.address) r)
 where nullif(btrim(coalesce(x.address, '')), '') is not null;
update clients x set (address, address_line1, address_line2, city, state, zip, address_needs_review) = (
    select case when r.ok then format_address(r.line1, r.line2, r.city, r.state, r.zip) else x.address end,
           r.line1, r.line2, r.city, r.state, r.zip, not r.ok
      from parse_us_address(x.address) r)
 where nullif(btrim(coalesce(x.address, '')), '') is not null;
update jobsites x set (address, address_line1, address_line2, city, state, zip, address_needs_review) = (
    select case when r.ok then format_address(r.line1, r.line2, r.city, r.state, r.zip) else x.address end,
           r.line1, r.line2, r.city, r.state, r.zip, not r.ok
      from parse_us_address(x.address) r)
 where nullif(btrim(coalesce(x.address, '')), '') is not null;

create trigger lead_sites_address before insert or update on lead_sites
  for each row execute function address_parts_sync();
create trigger clients_address before insert or update on clients
  for each row execute function address_parts_sync();
create trigger jobsites_address before insert or update on jobsites
  for each row execute function address_parts_sync();

-- Clientes: versión con la dirección separada (la de 5 parámetros sigue para las apps sin actualizar). ---------------

create function create_legacy_client(p_name text, p_phone text, p_email text, p_address text, p_notes text,
                                     p_address_line1 text, p_address_line2 text, p_city text, p_state text, p_zip text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  v_id := create_legacy_client(p_name, p_phone, p_email, null, p_notes);
  begin
    update clients set address_line1 = p_address_line1, address_line2 = p_address_line2, city = p_city,
           state = p_state, zip = p_zip
     where id = v_id;
  exception when check_violation then
    raise exception 'Dirección no válida' using errcode = '22023';
  end;
  return v_id;
end $$;

create function update_client(p_client uuid, p_name text, p_phone text, p_email text, p_address text, p_notes text,
                              p_address_line1 text, p_address_line2 text, p_city text, p_state text, p_zip text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform update_client(p_client, p_name, p_phone, p_email,
                        (select address from clients where id = p_client), p_notes);
  begin
    update clients set address_line1 = p_address_line1, address_line2 = p_address_line2, city = p_city,
           state = p_state, zip = p_zip
     where id = p_client;
  exception when check_violation then
    raise exception 'Dirección no válida' using errcode = '22023';
  end;
end $$;

revoke execute on function create_legacy_client(text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function update_client(uuid, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function create_legacy_client(text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function update_client(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- Jobsites: si p_data trae address_line1, la dirección se toma de las partes. --------------------------------------

create function jobsite_address_data(p_data jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select case when p_data ? 'address_line1'
    then p_data || jsonb_build_object('address', coalesce(format_address(p_data->>'address_line1', p_data->>'address_line2',
                                        p_data->>'city', p_data->>'state', p_data->>'zip'), ''))
    else p_data end
$$;

create function set_jobsite_address_parts(p_jobsite uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (p_data ? 'address_line1') then return; end if;
  update jobsites set address_line1 = p_data->>'address_line1', address_line2 = p_data->>'address_line2',
         city = p_data->>'city', state = p_data->>'state', zip = p_data->>'zip'
   where id = p_jobsite;
exception when check_violation then
  raise exception 'Dirección no válida' using errcode = '22023';
end $$;
revoke execute on function set_jobsite_address_parts(uuid, jsonb) from public, anon, authenticated;

alter function create_legacy_jobsite(uuid, jsonb, numeric) rename to create_legacy_jobsite_base;
alter function update_jobsite(uuid, jsonb) rename to update_jobsite_base;
revoke execute on function create_legacy_jobsite_base(uuid, jsonb, numeric) from public, anon, authenticated;
revoke execute on function update_jobsite_base(uuid, jsonb) from public, anon, authenticated;

create function create_legacy_jobsite(p_client uuid, p_data jsonb, p_rate numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  v_id := create_legacy_jobsite_base(p_client, jobsite_address_data(p_data), p_rate);
  perform set_jobsite_address_parts(v_id, p_data);
  return v_id;
end $$;

create function update_jobsite(p_jobsite uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform update_jobsite_base(p_jobsite, jobsite_address_data(p_data));
  perform set_jobsite_address_parts(p_jobsite, p_data);
end $$;

revoke execute on function create_legacy_jobsite(uuid, jsonb, numeric) from public, anon;
revoke execute on function update_jobsite(uuid, jsonb) from public, anon;
grant execute on function create_legacy_jobsite(uuid, jsonb, numeric) to authenticated;
grant execute on function update_jobsite(uuid, jsonb) to authenticated;

-- ICA: la dirección del contratista sale del perfil con format_address (antes dejaba ", " al final sin State ni ZIP).
create or replace function ica_default_fields(p_profile uuid) returns jsonb
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
    'contractor_address', coalesce(format_address(p.address_line1, p.address_line2, p.city, p.state, p.zip),
                            nullif(concat_ws(', ', nullif(w->>'address', ''), nullif(w->>'city', '')), ''), ''),
    'contractor_email', coalesce(p.email, ''),
    'contractor_phone', coalesce(p.phone, ''),
    'business_name', coalesce(w->>'business', ''),
    'sched_site_1', s1, 'sched_rate_1', r1, 'sched_site_2', s2, 'sched_rate_2', r2,
    'cc_title', 'Managing Member');
end $$;
