-- Orden 46 (D-268 (4)): certificado de la firma electrónica como última hoja del W-9 firmado. La firma guarda el
-- SHA-256 del PDF del W-9 antes de agregar el certificado, y su id lo genera la Edge Function (va impreso en el
-- certificado). w9_portal_sign queda igual con dos parámetros opcionales al final.
alter table w9_signatures add column pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$');

drop function w9_portal_sign(text, jsonb, text, text, boolean, text, text, text, text);
create function w9_portal_sign(p_session_hash text, p_data jsonb, p_tin_type text, p_signer_name text, p_agreed boolean,
                               p_form_version text, p_path text, p_ip text, p_user_agent text,
                               p_signature_id uuid default null, p_pdf_sha256 text default null) returns jsonb
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
  if p_pdf_sha256 is not null and p_pdf_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash no válido' using errcode = '22023';
  end if;
  insert into w9_signatures (id, request_id, profile_id, document_id, signer_name, agreed, tin_type, form_version, data,
                             changes, ip, user_agent, pdf_sha256)
  values (coalesce(p_signature_id, gen_random_uuid()), r.id, r.profile_id, v_doc, btrim(p_signer_name), true, p_tin_type,
          left(coalesce(p_form_version, ''), 60), d, v_changes, left(p_ip, 100), left(p_user_agent, 400), p_pdf_sha256);
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

-- Datos del certificado (solo la service role): correo verificado con el código y quién mandó el W-9 y cuándo.
create function w9_portal_certificate(p_session_hash text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ses w9_portal_sessions;
  r w9_requests;
begin
  select * into ses from w9_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then raise exception 'Sesión vencida' using errcode = '42501'; end if;
  select * into r from w9_requests where id = ses.request_id;
  return jsonb_build_object('email', ses.email, 'sent_at', r.sent_at, 'language', r.language,
                            'sent_by', (select full_name from profiles where id = r.sent_by));
end $$;

revoke execute on function w9_portal_sign(text, jsonb, text, text, boolean, text, text, text, text, uuid, text),
  w9_portal_certificate(text) from public, anon, authenticated;
grant execute on function w9_portal_sign(text, jsonb, text, text, boolean, text, text, text, text, uuid, text),
  w9_portal_certificate(text) to service_role;
