-- Órdenes 41 a 43 (D-255, D-256, D-257, D-258): W-9 prellenado para el empleado 1099.
-- Quien tiene empleados_gestionar_documentos (D-193) manda desde el perfil del 1099 un link seguro con los datos
-- prellenados; el empleado entra con un código de 6 dígitos (como el portal del quote, D-129, D-209), revisa y corrige
-- los datos, escribe su SSN, ITIN o EIN y firma escribiendo su nombre. El PDF oficial del IRS (Form W-9, Rev. March 2024)
-- llenado y firmado queda como el W-9 del perfil en employee-docs (D-175), y solo lo abre la Edge Function open-document.
--
-- Seguridad (obligatoria):
--  * El SSN/ITIN/EIN NUNCA llega a la base de datos: ni en estas tablas, ni en change_log, ni en los avisos. Entra solo
--    a la Edge Function w9-portal en el momento de firmar, se escribe en el PDF y se descarta. Aquí solo se guarda qué
--    tipo de número eligió (ssn, itin o ein).
--  * El link lleva un token aleatorio del que solo se guarda el hash; vence a los 7 días (D-256), es de un solo uso al
--    firmar y se puede reenviar (el reenvío cambia el token: el link anterior deja de servir).
--  * El código vale 10 minutos, 5 intentos fallidos lo bloquean hasta pedir uno nuevo y hay máximo 5 códigos por hora
--    (los mismos límites del portal del quote, D-129, D-209). Solo se guarda el hash del código y de la sesión.
--  * Las tablas no se leen ni se escriben directo: la app usa las funciones con permiso y el portal las funciones
--    w9_portal_*, que solo puede llamar la service role (desde la Edge Function).

-- Datos del formulario ----------------------------------------------------------------------------------------------
-- Claves de los datos (prellenados por la app y corregidos en el portal), todos texto salvo foreign_partners:
--   name (línea 1, obligatoria), business (línea 2), classification (línea 3a, selección: individual, c_corp, s_corp,
--   partnership, trust_estate, llc, other, D-257), llc (C, S o P, solo con llc), other (texto, solo con other),
--   foreign_partners (casilla 3b), exempt_payee y fatca (línea 4), address (línea 5, obligatoria), city (línea 6,
--   ciudad, estado y ZIP, obligatoria) y accounts (línea 7).
-- D-258 (reemplaza esa parte de D-257): la línea 4, la casilla 3b y la línea 7 quedan siempre disponibles, sin importar
-- la clasificación. El Requester es fijo (D-256): no es dato de la solicitud.

-- Limpia los datos: recorta textos; la letra del LLC y el texto de Other solo quedan con su clasificación.
create function w9_clean(p jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  c text := btrim(coalesce(p->>'classification', ''));
  l text := upper(btrim(coalesce(p->>'llc', '')));
  t text := 'string';
begin
  if p is null or jsonb_typeof(p) <> 'object' then return null; end if;
  -- Cada campo de texto debe ser texto (o faltar).
  if exists (select 1 from unnest(array['name', 'business', 'classification', 'llc', 'other', 'exempt_payee', 'fatca',
                                        'address', 'city', 'accounts']) k
              where p ? k and jsonb_typeof(p->k) not in (t, 'null')) then
    return null;
  end if;
  if p ? 'foreign_partners' and jsonb_typeof(p->'foreign_partners') not in ('boolean', 'null') then return null; end if;
  return jsonb_build_object(
    'name', btrim(coalesce(p->>'name', '')),
    'business', btrim(coalesce(p->>'business', '')),
    'classification', c,
    'llc', case when c = 'llc' then l else '' end,
    'other', case when c = 'other' then btrim(coalesce(p->>'other', '')) else '' end,
    'foreign_partners', coalesce((p->>'foreign_partners')::boolean, false),
    'exempt_payee', btrim(coalesce(p->>'exempt_payee', '')),
    'fatca', upper(btrim(coalesce(p->>'fatca', ''))),
    'address', btrim(coalesce(p->>'address', '')),
    'city', btrim(coalesce(p->>'city', '')),
    'accounts', btrim(coalesce(p->>'accounts', '')));
end $$;

-- Valida los datos ya limpios (textos D-200: largos máximos del arquitecto, códigos de la línea 4 según las
-- instrucciones del IRS: exempt payee 1 a 13, FATCA A a M).
create function w9_data_valid(d jsonb) returns boolean
language sql immutable set search_path = public as $$
  select d is not null
     and d->>'name' <> '' and length(d->>'name') <= 120
     and length(d->>'business') <= 120
     and d->>'classification' in ('individual', 'c_corp', 's_corp', 'partnership', 'trust_estate', 'llc', 'other')
     and (d->>'classification' <> 'llc' or d->>'llc' in ('C', 'S', 'P'))
     and (d->>'classification' <> 'other' or (d->>'other' <> '' and length(d->>'other') <= 60))
     and (d->>'exempt_payee' = '' or d->>'exempt_payee' ~ '^([1-9]|1[0-3])$')
     and (d->>'fatca' = '' or d->>'fatca' ~ '^[A-M]$')
     and d->>'address' <> '' and length(d->>'address') <= 120
     and d->>'city' <> '' and length(d->>'city') <= 120
     and length(d->>'accounts') <= 100
$$;

-- Qué datos prellenados cambió el empleado (D-255): nombre, negocio, clasificación y dirección, antes y después.
-- Nunca incluye el número.
create function w9_changes(p_before jsonb, p_after jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('field', f, 'before', b, 'after', a) order by n), '[]'::jsonb)
    from (
      select 1 n, 'name' f, p_before->>'name' b, p_after->>'name' a
      union all select 2, 'business', p_before->>'business', p_after->>'business'
      union all select 3, 'classification',
        concat_ws(':', p_before->>'classification', nullif(p_before->>'llc', ''), nullif(p_before->>'other', '')),
        concat_ws(':', p_after->>'classification', nullif(p_after->>'llc', ''), nullif(p_after->>'other', ''))
      union all select 4, 'address', concat_ws(', ', nullif(p_before->>'address', ''), nullif(p_before->>'city', '')),
                                     concat_ws(', ', nullif(p_after->>'address', ''), nullif(p_after->>'city', ''))
    ) x
   where coalesce(b, '') is distinct from coalesce(a, '')
$$;

-- Tablas ------------------------------------------------------------------------------------------------------------

create table w9_requests (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint generated always as identity, -- orden de llegada (la última solicitud es la que se muestra)
  profile_id  uuid not null references profiles(id) on delete cascade,
  -- Hash SHA-256 del token del link (el token solo va en el correo).
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status      text not null default 'sent' check (status in ('sent', 'signed', 'replaced')),
  email       text not null,
  language    app_language not null default 'en',
  prefill     jsonb not null,
  sent_by     uuid references profiles(id),
  sent_at     timestamptz not null default now(),
  resent_at   timestamptz,
  expires_at  timestamptz not null,
  viewed_at   timestamptz,
  signed_at   timestamptz,
  constraint w9_requests_prefill_valid check (w9_data_valid(prefill))
);
-- Una solicitud abierta por perfil: al mandar otra, la anterior queda reemplazada.
create unique index w9_requests_open on w9_requests (profile_id) where status = 'sent';
create index w9_requests_profile on w9_requests (profile_id, seq desc);

create table w9_portal_codes (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint generated always as identity, -- el último código es el que vale
  request_id  uuid not null references w9_requests(id) on delete cascade,
  email       text not null,
  code_hash   text not null,
  attempts    int not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index w9_portal_codes_lookup on w9_portal_codes (request_id, email, seq desc);

create table w9_portal_sessions (
  token_hash  text primary key,
  request_id  uuid not null references w9_requests(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

-- La firma (D-255, D-256): nombre escrito, fecha y hora, IP, user agent, versión del formulario, tipo de número (no el
-- número), los datos finales que quedaron en el PDF y qué cambió el empleado.
create table w9_signatures (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null unique references w9_requests(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  document_id   uuid not null references profile_documents(id),
  signer_name   text not null check (btrim(signer_name) <> '' and length(signer_name) <= 120),
  agreed        boolean not null check (agreed),
  tin_type      text not null check (tin_type in ('ssn', 'itin', 'ein')),
  form_version  text not null,
  data          jsonb not null,
  changes       jsonb not null default '[]'::jsonb,
  ip            text,
  user_agent    text,
  signed_at     timestamptz not null default now()
);

alter table w9_requests enable row level security;
alter table w9_portal_codes enable row level security;
alter table w9_portal_sessions enable row level security;
alter table w9_signatures enable row level security;
-- Sin políticas: nadie lee ni escribe directo; todo pasa por las funciones de abajo.
revoke all on w9_requests, w9_portal_codes, w9_portal_sessions, w9_signatures from anon, authenticated;

-- Funciones de la app (con permiso empleados_gestionar_documentos, D-193) ------------------------------------------

-- Crea la solicitud (lo llama la Edge Function send-w9 con el JWT de quien envía, que genera el token y manda el
-- correo). Reemplaza la solicitud abierta anterior del mismo perfil.
create function create_w9_request(p_profile uuid, p_data jsonb, p_email text, p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  target profiles;
  d jsonb := w9_clean(p_data);
  e text := lower(btrim(coalesce(p_email, '')));
  r w9_requests;
begin
  if not has_permission('empleados_gestionar_documentos') then
    raise exception 'No tienes permiso para gestionar documentos' using errcode = '42501';
  end if;
  select * into target from profiles where id = p_profile;
  if target.id is null then raise exception 'Empleado no encontrado' using errcode = 'P0002'; end if;
  if target.worker_type is distinct from '1099' then
    raise exception 'Solo los empleados 1099 llevan W-9' using errcode = '22023';
  end if;
  if not target.active then raise exception 'El empleado está desactivado' using errcode = '22023'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(e) > 200 then
    raise exception 'Correo no válido' using errcode = '22023';
  end if;
  if not w9_data_valid(d) then raise exception 'Datos del W-9 no válidos' using errcode = '22023'; end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'Token no válido' using errcode = '22023'; end if;

  update w9_requests set status = 'replaced' where profile_id = p_profile and status = 'sent';
  insert into w9_requests (profile_id, token_hash, email, language, prefill, sent_by, expires_at)
  values (p_profile, p_token_hash, e, target.language, d, current_profile_id(), now() + interval '7 days')
  returning * into r;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'w9_enviado', 'profile_documents', r.id,
          jsonb_build_object('profile_id', p_profile, 'kind', 'w9', 'email', e));
  return jsonb_build_object('id', r.id, 'email', r.email, 'name', d->>'name', 'expires_at', r.expires_at);
end $$;

-- Reenvía el link (D-256): token nuevo (el anterior deja de servir), vence otra vez a los 7 días y se cierran los
-- códigos y sesiones abiertos.
create function resend_w9_request(p_request uuid, p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r w9_requests;
begin
  if not has_permission('empleados_gestionar_documentos') then
    raise exception 'No tienes permiso para gestionar documentos' using errcode = '42501';
  end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'Token no válido' using errcode = '22023'; end if;
  select * into r from w9_requests where id = p_request for update;
  if r.id is null then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if r.status <> 'sent' then raise exception 'La solicitud ya no está abierta' using errcode = '22023'; end if;
  delete from w9_portal_sessions where request_id = r.id;
  delete from w9_portal_codes where request_id = r.id;
  update w9_requests set token_hash = p_token_hash, resent_at = now(), expires_at = now() + interval '7 days'
   where id = r.id returning * into r;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'w9_reenviado', 'profile_documents', r.id,
          jsonb_build_object('profile_id', r.profile_id, 'kind', 'w9', 'email', r.email));
  return jsonb_build_object('id', r.id, 'email', r.email, 'name', r.prefill->>'name', 'expires_at', r.expires_at);
end $$;

-- Estado del W-9 por llenar en el perfil: la última solicitud (abierta, vencida o firmada) y, si se firmó, qué cambió
-- el empleado y el documento que quedó.
create function w9_request_status(p_profile uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r w9_requests;
  s w9_signatures;
begin
  if not has_permission('empleados_gestionar_documentos') then
    raise exception 'No tienes permiso para gestionar documentos' using errcode = '42501';
  end if;
  select * into r from w9_requests where profile_id = p_profile and status <> 'replaced' order by seq desc limit 1;
  if r.id is null then return null; end if;
  select * into s from w9_signatures where request_id = r.id;
  return jsonb_build_object(
    'id', r.id,
    'status', case when r.status = 'signed' then 'signed' when r.expires_at <= now() then 'expired' else 'sent' end,
    'email', r.email, 'sent_at', r.sent_at, 'expires_at', r.expires_at, 'signed_at', r.signed_at,
    'document_id', s.document_id, 'changes', coalesce(s.changes, '[]'::jsonb));
end $$;

-- Funciones del portal (solo la Edge Function w9-portal, con la service role) ---------------------------------------

create function w9_portal_state(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r w9_requests;
begin
  select * into r from w9_requests where token_hash = p_token_hash;
  if r.id is null then return jsonb_build_object('state', 'not_found'); end if;
  return jsonb_build_object(
    'state', case when r.status = 'signed' then 'signed' when r.status = 'replaced' then 'replaced'
                  when r.expires_at <= now() then 'expired' else 'open' end,
    'language', r.language);
end $$;

-- Pedir código: solo para el correo de la solicitud; 5 códigos por hora; vale 10 minutos (D-129, D-209).
create function w9_portal_request_code(p_token_hash text, p_email text, p_code_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r w9_requests;
  e text := lower(btrim(coalesce(p_email, '')));
begin
  select * into r from w9_requests where token_hash = p_token_hash for update;
  if r.id is null or r.status <> 'sent' or r.expires_at <= now() then return 'closed'; end if;
  if e <> r.email then return 'not_recipient'; end if;
  if (select count(*) from w9_portal_codes where request_id = r.id and email = e
       and created_at > now() - interval '1 hour') >= 5 then
    return 'rate_limited';
  end if;
  insert into w9_portal_codes (request_id, email, code_hash, expires_at)
  values (r.id, e, p_code_hash, now() + interval '10 minutes');
  return 'sent';
end $$;

-- Verificar el código: 5 intentos fallidos lo bloquean hasta pedir uno nuevo. Si es correcto abre una sesión de hasta
-- 2 horas (sin pasar del vencimiento del link).
create function w9_portal_verify_code(p_token_hash text, p_email text, p_code_hash text, p_session_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r w9_requests;
  c w9_portal_codes;
  e text := lower(btrim(coalesce(p_email, '')));
begin
  select * into r from w9_requests where token_hash = p_token_hash for update;
  if r.id is null or r.status <> 'sent' or r.expires_at <= now() then return 'closed'; end if;
  select * into c from w9_portal_codes where request_id = r.id and email = e order by seq desc limit 1 for update;
  if c.id is null or c.used_at is not null then return 'expired'; end if;
  if c.attempts >= 5 then return 'locked'; end if;
  if c.expires_at <= now() then return 'expired'; end if;
  if c.code_hash <> p_code_hash then
    update w9_portal_codes set attempts = attempts + 1 where id = c.id;
    return case when c.attempts + 1 >= 5 then 'locked' else 'wrong' end;
  end if;
  update w9_portal_codes set used_at = now() where id = c.id;
  insert into w9_portal_sessions (token_hash, request_id, email, expires_at)
  values (p_session_hash, r.id, e, least(now() + interval '2 hours', r.expires_at));
  if r.viewed_at is null then update w9_requests set viewed_at = now() where id = r.id; end if;
  return 'ok';
end $$;

-- Lo que ve el empleado: los datos prellenados, el idioma de su perfil y, si ya firmó, cuándo y con qué nombre.
create function w9_portal_data(p_session_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ses w9_portal_sessions;
  r w9_requests;
  s w9_signatures;
begin
  select * into ses from w9_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then return null; end if;
  select * into r from w9_requests where id = ses.request_id;
  select * into s from w9_signatures where request_id = r.id;
  return jsonb_build_object(
    'status', case when r.status = 'signed' then 'signed' when r.status = 'replaced' then 'replaced'
                   when r.expires_at <= now() then 'expired' else 'open' end,
    'language', r.language, 'data', coalesce(s.data, r.prefill), 'expires_at', r.expires_at,
    'signed_at', s.signed_at, 'signer_name', s.signer_name);
end $$;

-- Revisa lo que se va a firmar antes de llenar el PDF (la Edge Function lo llama, llena el PDF, lo sube y después
-- llama a w9_portal_sign). Devuelve los datos limpios y dónde va el archivo. No guarda nada.
create function w9_portal_check(p_session_hash text, p_data jsonb, p_tin_type text, p_signer_name text, p_agreed boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ses w9_portal_sessions;
  r w9_requests;
  d jsonb := w9_clean(p_data);
begin
  select * into ses from w9_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then raise exception 'Sesión vencida' using errcode = '42501'; end if;
  select * into r from w9_requests where id = ses.request_id;
  if r.status <> 'sent' or r.expires_at <= now() then raise exception 'El W-9 ya no está abierto' using errcode = '22023'; end if;
  if not w9_data_valid(d) then raise exception 'Datos del W-9 no válidos' using errcode = '22023'; end if;
  if p_tin_type is not null and p_tin_type not in ('ssn', 'itin', 'ein') then
    raise exception 'Tipo de número no válido' using errcode = '22023';
  end if;
  if p_signer_name is not null and (btrim(p_signer_name) = '' or length(p_signer_name) > 120) then
    raise exception 'Falta el nombre de la firma' using errcode = '22023';
  end if;
  -- La Edge Function agrega "-<aleatorio>.pdf": cada intento sube su propio archivo (dos intentos a la vez nunca pisan
  -- ni borran el PDF que quedó firmado).
  return jsonb_build_object('request_id', r.id, 'profile_id', r.profile_id, 'data', d,
    'path_prefix', r.profile_id::text || '/w9/signed-' || r.id::text);
end $$;

-- Firma (un solo uso): registra el PDF ya subido como el W-9 vigente del perfil (el anterior queda reemplazado), la
-- firma con lo que cambió el empleado, marca la solicitud como firmada y avisa a quien la envió dentro de la app.
create function w9_portal_sign(p_session_hash text, p_data jsonb, p_tin_type text, p_signer_name text, p_agreed boolean,
                               p_form_version text, p_path text, p_ip text, p_user_agent text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ses w9_portal_sessions;
  r w9_requests;
  d jsonb := w9_clean(p_data);
  v_changes jsonb;
  v_old uuid;
  v_doc uuid;
  v_name text;
begin
  select * into ses from w9_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then raise exception 'Sesión vencida' using errcode = '42501'; end if;
  select * into r from w9_requests where id = ses.request_id for update;
  if r.status <> 'sent' or r.expires_at <= now() then raise exception 'El W-9 ya no está abierto' using errcode = '22023'; end if;
  if not w9_data_valid(d) then raise exception 'Datos del W-9 no válidos' using errcode = '22023'; end if;
  if coalesce(p_tin_type, '') not in ('ssn', 'itin', 'ein') then raise exception 'Tipo de número no válido' using errcode = '22023'; end if;
  if not coalesce(p_agreed, false) then raise exception 'Falta la casilla de firma' using errcode = '22023'; end if;
  if btrim(coalesce(p_signer_name, '')) = '' or length(p_signer_name) > 120 then
    raise exception 'Falta el nombre de la firma' using errcode = '22023';
  end if;
  if coalesce(p_path, '') !~ ('^' || r.profile_id::text || '/w9/signed-' || r.id::text || '-[A-Za-z0-9_-]{8,64}\.pdf$') then
    raise exception 'La ruta del archivo no corresponde' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'employee-docs' and name = p_path) then
    raise exception 'El archivo no está en el almacenamiento' using errcode = '22023';
  end if;

  select id into v_old from profile_documents where profile_id = r.profile_id and kind = 'w9' and replaced_at is null;
  if v_old is not null then update profile_documents set replaced_at = now() where id = v_old; end if;
  insert into profile_documents (profile_id, kind, file_path, uploaded_by)
  values (r.profile_id, 'w9', p_path, null) returning id into v_doc;

  v_changes := w9_changes(r.prefill, d);
  insert into w9_signatures (request_id, profile_id, document_id, signer_name, agreed, tin_type, form_version, data,
                             changes, ip, user_agent)
  values (r.id, r.profile_id, v_doc, btrim(p_signer_name), true, p_tin_type, left(coalesce(p_form_version, ''), 60), d,
          v_changes, left(p_ip, 100), left(p_user_agent, 400));
  update w9_requests set status = 'signed', signed_at = now() where id = r.id;
  delete from w9_portal_sessions where request_id = r.id and token_hash <> p_session_hash;

  select full_name into v_name from profiles where id = r.profile_id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (null, case when v_old is null then 'documento_subido' else 'documento_reemplazado' end, 'profile_documents', v_doc,
          jsonb_build_object('profile_id', r.profile_id, 'kind', 'w9', 'reemplaza', v_old));
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (null, 'w9_firmado', 'profile_documents', v_doc,
          jsonb_build_object('profile_id', r.profile_id, 'kind', 'w9', 'changed', jsonb_array_length(v_changes) > 0));

  -- Aviso a quien la envió (los avisos existentes, D-215). Un fallo del aviso no hace fallar la firma.
  begin
    if r.sent_by is not null then
      perform notify_profiles(array[r.sent_by], 'w9_signed', jsonb_build_object('name', v_name),
        jsonb_build_object('pathname', '/employees/[id]', 'params', jsonb_build_object('id', r.profile_id)), false,
        'w9:' || r.id);
    end if;
  exception when others then
    null;
  end;
  return jsonb_build_object('document_id', v_doc, 'signed_at', now());
end $$;

-- Texto del aviso "W-9 firmado" (D-200): igual que en 20261027000003 con un caso más.
create or replace function notification_text(p_kind text, d jsonb, lang text, out title text, out detail text)
language plpgsql stable set search_path = public as $$
declare
  es boolean := lang = 'es';
  place text := concat_ws(' · ', nullif(d->>'company', ''), nullif(d->>'site', ''));
  day text := case when d ? 'day' then cc_short_date((d->>'day')::date, lang) end;
begin
  case p_kind
    when 'quote_viewed' then title := case when es then 'Quote visto' else 'Quote viewed' end; detail := place;
    when 'quote_accepted' then title := case when es then 'Quote aceptado' else 'Quote accepted' end; detail := place;
    when 'quote_rejected' then title := case when es then 'Quote rechazado' else 'Quote rejected' end; detail := place;
    when 'quote_changes' then title := case when es then 'Nueva versión solicitada' else 'New version requested' end; detail := place;
    when 'quote_expiring' then
      title := case when es then 'Quote por vencer' else 'Quote expiring' end;
      detail := concat_ws(' · ', place, case when es then 'vence el ' else 'expires ' end || day);
    when 'quote_expired' then title := case when es then 'Quote expirado' else 'Quote expired' end; detail := place;
    when 'walkthrough_scheduled' then
      title := case when es then 'Walkthrough agendado' else 'Walkthrough scheduled' end;
      detail := concat_ws(' · ', place, day || ' ' || coalesce(d->>'time', ''));
    when 'followup_due' then title := case when es then 'Seguimiento de lead pendiente' else 'Lead follow-up due' end; detail := d->>'company';
    when 'schedule_changed' then
      title := case when es then 'Horario nuevo o cambiado' else 'New or changed schedule' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'schedule_removed' then
      title := case when es then 'Te quitaron de una visita' else 'You were removed from a visit' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'visit_soon' then
      title := case when es then 'Visita en las próximas horas' else 'Visit in the next few hours' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'time');
    when 'work_to_approve' then
      title := case when es then 'Trabajo pendiente de aprobar' else 'Work pending approval' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'gps_out' then
      title := case when es then 'Clock in con GPS fuera de rango' else 'Clock in with GPS out of range' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'name');
    when 'clock_in_forgotten' then
      title := case when es then 'Clock in olvidado' else 'Forgotten clock in' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'name');
    when 'clock_out_forgotten' then
      title := case when es then 'Clock out olvidado' else 'Forgotten clock out' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'name', day);
    when 'work_approved' then
      title := case when es then 'Trabajo aprobado' else 'Work approved' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'income_unmarked' then
      title := case when es then 'Ingreso esperado sin marcar como recibido' else 'Expected income not marked as received' end;
      detail := (d->>'count') || case when es then ' de ' else ' in ' end || cc_month_name((d->>'month')::date, lang);
    when 'margin_alert' then title := case when es then 'Alerta de margen' else 'Margin alert' end; detail := d->>'jobsite';
    when 'recurring_generated' then
      title := case when es then 'Gasto recurrente generado' else 'Recurring expense created' end;
      detail := concat_ws(' · ', d->>'name', '$' || to_char((d->>'amount')::numeric, 'FM999,999,990.00'));
    when 'hours_32' then
      title := case when es then 'Alerta de 32 h semanales' else '32 h weekly alert' end;
      detail := (d->>'name') || case when es then ' lleva ' else ' has ' end || (d->>'hours') || ' h';
    when 'permissions_changed' then
      title := case when es then 'Cambio de permisos' else 'Permissions changed' end;
      detail := case when es then 'Revisa lo que puedes ver en la app.' else 'Check what you can see in the app.' end;
    when 'terms_new' then
      title := case when es then 'Nueva versión de términos y condiciones por aceptar' else 'New terms and conditions to accept' end;
      detail := (case when es then 'Versión ' else 'Version ' end) || (d->>'version');
    when 'w9_signed' then
      title := case when es then 'W-9 firmado' else 'W-9 signed' end;
      detail := d->>'name';
    else title := p_kind; detail := null;
  end case;
end $$;

-- Permisos de ejecución ---------------------------------------------------------------------------------------------
revoke execute on function w9_clean(jsonb), w9_data_valid(jsonb), w9_changes(jsonb, jsonb),
  w9_portal_state(text), w9_portal_request_code(text, text, text), w9_portal_verify_code(text, text, text, text),
  w9_portal_data(text), w9_portal_check(text, jsonb, text, text, boolean),
  w9_portal_sign(text, jsonb, text, text, boolean, text, text, text, text) from public, anon, authenticated;
grant execute on function w9_portal_state(text), w9_portal_request_code(text, text, text),
  w9_portal_verify_code(text, text, text, text), w9_portal_data(text), w9_portal_check(text, jsonb, text, text, boolean),
  w9_portal_sign(text, jsonb, text, text, boolean, text, text, text, text) to service_role;
revoke execute on function create_w9_request(uuid, jsonb, text, text), resend_w9_request(uuid, text),
  w9_request_status(uuid) from public, anon;
grant execute on function create_w9_request(uuid, jsonb, text, text), resend_w9_request(uuid, text),
  w9_request_status(uuid) to authenticated;
-- notification_text la usa my_notifications (security definer); se conserva sin ejecución directa.
revoke execute on function notification_text(text, jsonb, text) from public, anon, authenticated;
