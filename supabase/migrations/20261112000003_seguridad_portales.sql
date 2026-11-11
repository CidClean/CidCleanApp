-- Orden 82 (revisión de seguridad del hito 8): portales.
-- B3: jobsite_docs_insert compara con storage.objects.name (antes `name` resolvía a jobsites.name y nunca se cumplía)
--     y comprueba el jobsite con jobsite_exists() (sin depender de la lectura de jobsites de quien sube).
-- B4: tope total de intentos fallidos por link (15, D-200) que lo bloquea hasta que se reenvíe con un enlace nuevo;
--     "sin código", "código vencido", "código usado" y "código incorrecto" dan la misma respuesta ('wrong').
-- B5: el token del portal del quote se guarda solo como hash (como W-9, contrato e ICA). Los enlaces ya enviados
--     siguen sirviendo (se migran a hash). Reenviar genera un enlace nuevo y el anterior sigue valiendo.
-- B6: el enlace de un uso del W-9 devuelve su acción (abrir o descargar); w9-file ya no mira la URL.
-- Se despliega junto con las Edge Functions quote-portal, send-quote, w9-portal, contract-portal, ica-portal y w9-file.

-- B3 ------------------------------------------------------------------------------------------------------------
-- Existe el jobsite (sin depender de que quien sube pueda leer la tabla jobsites).
create function jobsite_exists(p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from jobsites j where j.id::text = p_id)
$$;
revoke all on function jobsite_exists(text) from public, anon;
grant execute on function jobsite_exists(text) to authenticated;

drop policy jobsite_docs_insert on storage.objects;
create policy jobsite_docs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'jobsite-docs'
    and objects.name ~ '^[0-9a-f-]{36}/(sow|contract|other)/[A-Za-z0-9_-]+\.pdf$'
    and jobsite_exists(split_part(objects.name, '/', 1))
    and ((split_part(objects.name, '/', 2) = 'sow' and has_permission('clientes_editar_walkthrough_sow'))
         or (split_part(objects.name, '/', 2) = 'contract' and has_permission('clientes_editar_datos')
             and has_permission('clientes_ver_tarifa'))
         or (split_part(objects.name, '/', 2) = 'other' and has_permission('clientes_editar_datos'))));

-- B4 ------------------------------------------------------------------------------------------------------------
-- Intentos fallidos por link (por el hash del token: un enlace nuevo empieza de cero).
create table portal_link_failures (
  kind       text not null check (kind in ('quote', 'w9', 'contract', 'ica')),
  token_hash text not null,
  failures   int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (kind, token_hash)
);
alter table portal_link_failures enable row level security;
revoke all on portal_link_failures from public, anon, authenticated;

-- D-200: 15 intentos fallidos en total bloquean el link.
create function portal_link_max_failures() returns int language sql immutable set search_path = public as $$ select 15 $$;

create function portal_link_locked(p_kind text, p_token_hash text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select failures >= portal_link_max_failures() from portal_link_failures
                    where kind = p_kind and token_hash = p_token_hash), false)
$$;

create function portal_link_fail(p_kind text, p_token_hash text) returns void
language sql security definer set search_path = public as $$
  insert into portal_link_failures (kind, token_hash, failures) values (p_kind, p_token_hash, 1)
  on conflict (kind, token_hash) do update set failures = portal_link_failures.failures + 1, updated_at = now()
$$;

revoke all on function portal_link_max_failures(), portal_link_locked(text, text), portal_link_fail(text, text)
  from public, anon, authenticated;

-- B5 ------------------------------------------------------------------------------------------------------------
alter table quote_versions rename column public_token to public_token_hash;
alter table quote_versions add column previous_token_hashes text[] not null default '{}';
update quote_versions set public_token_hash = encode(sha256(convert_to(public_token_hash, 'UTF8')), 'hex')
 where public_token_hash is not null;

create function quote_version_by_token(p_token_hash text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from quote_versions
   where p_token_hash is not null and (public_token_hash = p_token_hash or p_token_hash = any (previous_token_hashes))
   limit 1
$$;
revoke all on function quote_version_by_token(text) from public, anon, authenticated;

create function quote_new_token() returns text language sql volatile set search_path = public as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_')
$$;
revoke all on function quote_new_token() from public, anon, authenticated;

create or replace function confirm_send_quote(p_version uuid, p_actor uuid, p_pdf_path text, p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
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
   where id = q.lead_id and status in ('new', 'contacted', 'walkthrough_scheduled', 'walkthrough_done');
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'quote_enviado', 'quotes', q.id, jsonb_build_object('version', quote_version_label(v.minor)));
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end $$;

-- Datos para reenviar el correo de una versión enviada (sin token). Solo la usan otras funciones.
drop function quote_mail_data_full(uuid);
create function quote_mail_info(p_version uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
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
    'extra', coalesce((v.snapshot->>'extra')::boolean, false), 'service_date', v.snapshot->>'service_date',
    'contact_name', v_contact, 'lines', v.lines, 'total', v.total, 'pdf_path', v.pdf_path,
    'recipients', to_jsonb(v_to));
end $$;

-- Reenviar: enlace nuevo (el anterior sigue valiendo) y los datos del correo. Solo la service role, después de que
-- quote_mail_data validó el permiso con el JWT de quien reenvía.
create function quote_resend_data(p_version uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := quote_mail_info(p_version);
  v_token text := quote_new_token();
begin
  update quote_versions
     set previous_token_hashes = case when public_token_hash is null then previous_token_hashes
                                      else array_append(previous_token_hashes, public_token_hash) end,
         public_token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
   where id = p_version;
  return r || jsonb_build_object('token', v_token);
end $$;

create or replace function quote_mail_data(p_version uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
begin
  if not has_permission('quotes_enviar') then
    raise exception 'No tienes permiso para enviar quotes' using errcode = '42501';
  end if;
  r := quote_mail_info(p_version);
  return case when has_permission('quotes_ver_precios') then r else quote_strip_prices(r) end;
end $$;

revoke all on function quote_mail_info(uuid), quote_resend_data(uuid) from public, anon, authenticated;
grant execute on function quote_resend_data(uuid) to service_role;

-- Portal del quote: reciben el hash del token (B5) y aplican el tope por link (B4).
drop function portal_state(text);
drop function portal_request_code(text, text, text);
drop function portal_verify_code(text, text, text, text);

create function portal_state(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
begin
  perform expire_quotes();
  select * into v from quote_versions where id = quote_version_by_token(p_token_hash);
  if v.id is null then return jsonb_build_object('state', 'not_found'); end if;
  return jsonb_build_object(
    'state', case when v.status in ('sent', 'viewed') and portal_link_locked('quote', p_token_hash) then 'expired'
                  else case v.status when 'sent' then 'open' when 'viewed' then 'open' when 'superseded' then 'superseded'
                                     when 'expired' then 'expired' when 'changes_requested' then 'changes_requested'
                                     else 'decided' end end,
    'language', v.snapshot->>'language');
end $$;

create function portal_request_code(p_token_hash text, p_email text, p_code_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
  e text := lower(btrim(coalesce(p_email, '')));
begin
  perform expire_quotes();
  select * into v from quote_versions where id = quote_version_by_token(p_token_hash) for update;
  if v.id is null or v.status not in ('sent', 'viewed') or portal_link_locked('quote', p_token_hash) then return 'closed'; end if;
  if not (e = v.contact_email or e = any (v.recipients)) then return 'not_recipient'; end if;
  if (select count(*) from quote_portal_codes where version_id = v.id and email = e
       and created_at > now() - interval '1 hour') >= 5 then
    return 'rate_limited';
  end if;
  insert into quote_portal_codes (version_id, email, code_hash, expires_at)
  values (v.id, e, p_code_hash, now() + interval '10 minutes');
  return 'sent';
end $$;

create function portal_verify_code(p_token_hash text, p_email text, p_code_hash text, p_session_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
  c quote_portal_codes;
  e text := lower(btrim(coalesce(p_email, '')));
begin
  perform expire_quotes();
  select * into v from quote_versions where id = quote_version_by_token(p_token_hash) for update;
  if v.id is null or v.status not in ('sent', 'viewed') or portal_link_locked('quote', p_token_hash) then return 'closed'; end if;
  select * into c from quote_portal_codes where version_id = v.id and email = e order by seq desc limit 1 for update;
  -- B4: sin código, usado, bloqueado, vencido o incorrecto: la misma respuesta, y cuenta para el tope del link.
  if c.id is null or c.used_at is not null or c.attempts >= 5 or c.expires_at <= now() or c.code_hash <> p_code_hash then
    if c.id is not null and c.used_at is null then
      update quote_portal_codes set attempts = attempts + 1 where id = c.id;
    end if;
    perform portal_link_fail('quote', p_token_hash);
    return 'wrong';
  end if;
  update quote_portal_codes set used_at = now() where id = c.id;
  insert into quote_portal_sessions (token_hash, version_id, email, expires_at)
  values (p_session_hash, v.id, e, least(now() + interval '2 hours', v.expires_at));
  if v.status = 'sent' then
    update quote_versions set status = 'viewed', viewed_at = now() where id = v.id;
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (null, 'quote_visto', 'quotes', v.quote_id, jsonb_build_object('version', quote_version_label(v.minor)));
  end if;
  return 'ok';
end $$;

revoke all on function portal_state(text), portal_request_code(text, text, text), portal_verify_code(text, text, text, text)
  from public, anon, authenticated;
grant execute on function portal_state(text), portal_request_code(text, text, text), portal_verify_code(text, text, text, text)
  to service_role;

-- W-9 -----------------------------------------------------------------------------------------------------------
create or replace function w9_portal_state(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r w9_requests;
begin
  select * into r from w9_requests where token_hash = p_token_hash;
  if r.id is null then return jsonb_build_object('state', 'not_found'); end if;
  return jsonb_build_object(
    'state', case when r.status = 'signed' then 'signed' when r.status = 'replaced' then 'replaced'
                  when r.expires_at <= now() or portal_link_locked('w9', p_token_hash) then 'expired' else 'open' end,
    'language', r.language);
end $$;

create or replace function w9_portal_request_code(p_token_hash text, p_email text, p_code_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r w9_requests;
  e text := lower(btrim(coalesce(p_email, '')));
begin
  select * into r from w9_requests where token_hash = p_token_hash for update;
  if r.id is null or r.status <> 'sent' or r.expires_at <= now() or portal_link_locked('w9', p_token_hash) then
    return 'closed';
  end if;
  if e <> r.email then return 'not_recipient'; end if;
  if (select count(*) from w9_portal_codes where request_id = r.id and email = e
       and created_at > now() - interval '1 hour') >= 5 then
    return 'rate_limited';
  end if;
  insert into w9_portal_codes (request_id, email, code_hash, expires_at)
  values (r.id, e, p_code_hash, now() + interval '10 minutes');
  return 'sent';
end $$;

create or replace function w9_portal_verify_code(p_token_hash text, p_email text, p_code_hash text, p_session_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r w9_requests;
  c w9_portal_codes;
  e text := lower(btrim(coalesce(p_email, '')));
begin
  select * into r from w9_requests where token_hash = p_token_hash for update;
  if r.id is null or r.status <> 'sent' or r.expires_at <= now() or portal_link_locked('w9', p_token_hash) then
    return 'closed';
  end if;
  select * into c from w9_portal_codes where request_id = r.id and email = e order by seq desc limit 1 for update;
  if c.id is null or c.used_at is not null or c.attempts >= 5 or c.expires_at <= now() or c.code_hash <> p_code_hash then
    if c.id is not null and c.used_at is null then
      update w9_portal_codes set attempts = attempts + 1 where id = c.id;
    end if;
    perform portal_link_fail('w9', p_token_hash);
    return 'wrong';
  end if;
  update w9_portal_codes set used_at = now() where id = c.id;
  insert into w9_portal_sessions (token_hash, request_id, email, expires_at)
  values (p_session_hash, r.id, e, least(now() + interval '2 hours', r.expires_at));
  if r.viewed_at is null then update w9_requests set viewed_at = now() where id = r.id; end if;
  return 'ok';
end $$;

-- Contrato del cliente --------------------------------------------------------------------------------------------
create or replace function contract_portal_state(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts;
begin
  perform jobsite_contracts_expire();
  select * into c from client_contracts where token_hash = p_token_hash;
  if c.id is null then return jsonb_build_object('state', 'not_found'); end if;
  return jsonb_build_object('state', case when c.status in ('client_signed', 'signed') then 'signed'
                                          when c.status <> 'sent' then 'closed'
                                          when c.expires_at <= now() or portal_link_locked('contract', p_token_hash) then 'expired'
                                          else 'open' end);
end $$;

create or replace function contract_portal_request_code(p_token_hash text, p_email text, p_code_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts; e text := lower(btrim(coalesce(p_email, '')));
begin
  perform jobsite_contracts_expire();
  select * into c from client_contracts where token_hash = p_token_hash for update;
  if c.id is null or c.status <> 'sent' or c.expires_at <= now() or portal_link_locked('contract', p_token_hash) then
    return 'closed';
  end if;
  if e <> c.email then return 'not_recipient'; end if;
  if (select count(*) from contract_portal_codes where contract_id = c.id and email = e
       and created_at > now() - interval '1 hour') >= 5 then
    return 'rate_limited';
  end if;
  insert into contract_portal_codes (contract_id, email, code_hash, expires_at) values (c.id, e, p_code_hash, now() + interval '10 minutes');
  return 'sent';
end $$;

create or replace function contract_portal_verify_code(p_token_hash text, p_email text, p_code_hash text, p_session_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts; k contract_portal_codes; e text := lower(btrim(coalesce(p_email, '')));
begin
  select * into c from client_contracts where token_hash = p_token_hash for update;
  if c.id is null or c.status <> 'sent' or c.expires_at <= now() or portal_link_locked('contract', p_token_hash) then
    return 'closed';
  end if;
  select * into k from contract_portal_codes where contract_id = c.id and email = e order by seq desc limit 1 for update;
  if k.id is null or k.used_at is not null or k.attempts >= 5 or k.expires_at <= now() or k.code_hash <> p_code_hash then
    if k.id is not null and k.used_at is null then
      update contract_portal_codes set attempts = attempts + 1 where id = k.id;
    end if;
    perform portal_link_fail('contract', p_token_hash);
    return 'wrong';
  end if;
  update contract_portal_codes set used_at = now() where id = k.id;
  insert into contract_portal_sessions (token_hash, contract_id, email, expires_at)
  values (p_session_hash, c.id, e, least(now() + interval '2 hours', c.expires_at));
  if c.viewed_at is null then update client_contracts set viewed_at = now() where id = c.id; end if;
  return 'ok';
end $$;

-- ICA del contratista ---------------------------------------------------------------------------------------------
create or replace function ica_portal_state(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements;
begin
  select * into c from contractor_agreements where token_hash = p_token_hash;
  if c.id is null then return jsonb_build_object('state', 'not_found'); end if;
  return jsonb_build_object('state', case when c.status in ('contractor_signed', 'signed') then 'signed'
                                          when c.status <> 'sent' then 'closed'
                                          when c.expires_at <= now() or portal_link_locked('ica', p_token_hash) then 'expired'
                                          else 'open' end);
end $$;

create or replace function ica_portal_request_code(p_token_hash text, p_email text, p_code_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements; e text := lower(btrim(coalesce(p_email, '')));
begin
  select * into c from contractor_agreements where token_hash = p_token_hash for update;
  if c.id is null or c.status <> 'sent' or c.expires_at <= now() or portal_link_locked('ica', p_token_hash) then
    return 'closed';
  end if;
  if e <> c.email then return 'not_recipient'; end if;
  if (select count(*) from ica_portal_codes where agreement_id = c.id and email = e and created_at > now() - interval '1 hour') >= 5 then
    return 'rate_limited';
  end if;
  insert into ica_portal_codes (agreement_id, email, code_hash, expires_at) values (c.id, e, p_code_hash, now() + interval '10 minutes');
  return 'sent';
end $$;

create or replace function ica_portal_verify_code(p_token_hash text, p_email text, p_code_hash text, p_session_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c contractor_agreements; k ica_portal_codes; e text := lower(btrim(coalesce(p_email, '')));
begin
  select * into c from contractor_agreements where token_hash = p_token_hash for update;
  if c.id is null or c.status <> 'sent' or c.expires_at <= now() or portal_link_locked('ica', p_token_hash) then
    return 'closed';
  end if;
  select * into k from ica_portal_codes where agreement_id = c.id and email = e order by seq desc limit 1 for update;
  if k.id is null or k.used_at is not null or k.attempts >= 5 or k.expires_at <= now() or k.code_hash <> p_code_hash then
    if k.id is not null and k.used_at is null then
      update ica_portal_codes set attempts = attempts + 1 where id = k.id;
    end if;
    perform portal_link_fail('ica', p_token_hash);
    return 'wrong';
  end if;
  update ica_portal_codes set used_at = now() where id = k.id;
  insert into ica_portal_sessions (token_hash, agreement_id, email, expires_at)
  values (p_session_hash, c.id, e, least(now() + interval '2 hours', c.expires_at));
  if c.viewed_at is null then update contractor_agreements set viewed_at = now() where id = c.id; end if;
  return 'ok';
end $$;

-- B6 ------------------------------------------------------------------------------------------------------------
-- Consume el enlace (una vez, antes de que venza) y devuelve la ruta del archivo cifrado y la acción guardada.
drop function consume_w9_open_token(text);
create function consume_w9_open_token(p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_path text;
  v_action text;
begin
  update w9_open_tokens t set used_at = now()
   where t.token_hash = p_hash and t.used_at is null and t.expires_at > now()
  returning (select d.file_path from profile_documents d where d.id = t.document_id), t.action into v_path, v_action;
  if v_path is null then
    raise exception 'Enlace vencido o ya usado' using errcode = 'P0002';
  end if;
  -- Los enlaces viejos no se guardan.
  delete from w9_open_tokens where expires_at < now() - interval '1 day';
  return jsonb_build_object('path', v_path, 'action', v_action);
end $$;
revoke execute on function consume_w9_open_token(text) from public, anon, authenticated;
grant  execute on function consume_w9_open_token(text) to service_role;
