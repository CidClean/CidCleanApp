-- Orden 59 (D-280, legal rev. 3, tarea 8): el PDF del W-9 se guarda cifrado (AES-256-GCM, clave W9_FILE_KEY solo en
-- las Edge Functions). Lo abren solo el Super Admin y el propio contratista; cada apertura o descarga queda en el
-- historial (quién, cuándo, cuál).
-- * profile_documents.encrypted marca los archivos cifrados (los nuevos terminan en .enc; los ya guardados los cifra
--   supabase/scripts/cifrar-w9-existentes.mjs y los marca).
-- * Nadie sube un W-9 directo a Storage desde la app: lo sube w9-portal (firma) o upload-w9 (admin), que lo cifran con
--   la service role. register_profile_document solo registra W-9 cifrados.
-- * Abrir: open-document llama a open_profile_document (permiso + historial) y, si el archivo está cifrado, crea un
--   enlace de un solo uso que vale 60 s (w9_open_tokens, solo el hash); w9-file lo consume, descifra y entrega el PDF.

alter table profile_documents add column encrypted boolean not null default false;

create function profile_documents_mark_encrypted() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.file_path like '%.enc' then new.encrypted := true; end if;
  return new;
end $$;
create trigger profile_documents_encrypted before insert on profile_documents
  for each row execute function profile_documents_mark_encrypted();
revoke execute on function profile_documents_mark_encrypted() from public, anon, authenticated;

-- Enlaces de un solo uso para abrir o descargar un documento cifrado (solo la service role los crea y los consume).
create table w9_open_tokens (
  token_hash  text primary key,
  document_id uuid not null references profile_documents(id) on delete cascade,
  opened_by   uuid references profiles(id),
  action      text not null check (action in ('open', 'download')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '60 seconds',
  used_at     timestamptz
);
alter table w9_open_tokens enable row level security;
revoke all on w9_open_tokens from anon, authenticated;

-- Consume el enlace (una vez, antes de que venza) y devuelve la ruta del archivo cifrado.
create function consume_w9_open_token(p_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  update w9_open_tokens t set used_at = now()
   where t.token_hash = p_hash and t.used_at is null and t.expires_at > now()
  returning (select d.file_path from profile_documents d where d.id = t.document_id) into v_path;
  if v_path is null then
    raise exception 'Enlace vencido o ya usado' using errcode = 'P0002';
  end if;
  -- Los enlaces viejos no se guardan.
  delete from w9_open_tokens where expires_at < now() - interval '1 day';
  return v_path;
end $$;
revoke execute on function consume_w9_open_token(text) from public, anon, authenticated;
grant  execute on function consume_w9_open_token(text) to service_role;

-- Abrir o descargar: mismo permiso que antes (D-263, D-271) con el W-9 solo para el Super Admin o su dueño (D-280);
-- deja documento_abierto o documento_descargado en el historial.
drop function open_profile_document(uuid);
create function open_profile_document(doc_id uuid, p_action text default 'open') returns text
language plpgsql security definer set search_path = public as $$
declare
  doc profile_documents;
  me uuid := current_profile_id();
begin
  if p_action is null or p_action not in ('open', 'download') then
    raise exception 'Acción no válida' using errcode = '22023';
  end if;
  select * into doc from profile_documents where id = doc_id;
  if not found then
    if not has_permission('empleados_gestionar_documentos') then
      raise exception 'No tienes permiso para ver documentos' using errcode = '42501';
    end if;
    raise exception 'Documento no encontrado' using errcode = 'P0002';
  end if;
  if me is null or doc.profile_id <> me then
    if not has_permission('empleados_gestionar_documentos') then
      raise exception 'No tienes permiso para ver documentos' using errcode = '42501';
    end if;
    if doc.kind = 'w9' and not is_super_admin() then
      raise exception 'Solo el Super Admin puede abrir el W-9' using errcode = '42501';
    end if;
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me, case when p_action = 'download' then 'documento_descargado' else 'documento_abierto' end,
          'profile_documents', doc.id,
          jsonb_build_object('profile_id', doc.profile_id, 'kind', doc.kind, 'encrypted', doc.encrypted));
  return doc.file_path;
end $$;
revoke execute on function open_profile_document(uuid, text) from public, anon;
grant  execute on function open_profile_document(uuid, text) to authenticated;

-- Subir a Storage desde la app: el certificado de seguro sí (quien gestiona documentos o el propio 1099); el W-9 no.
drop policy employee_docs_insert on storage.objects;
create policy employee_docs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'employee-docs' and (storage.foldername(name))[2] = 'insurance_certificate' and (
      has_permission('empleados_gestionar_documentos')
      or (storage.foldername(name))[1] = current_profile_id()::text
    )
  );

-- Registrar: igual que antes, y un W-9 solo si está cifrado (lo sube upload-w9).
create or replace function register_profile_document(p_profile uuid, p_kind text, p_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  old_id uuid;
  me uuid := current_profile_id();
begin
  if not (has_permission('empleados_gestionar_documentos')
          or (p_profile = me and p_kind = 'insurance_certificate')) then
    raise exception 'No tienes permiso para subir documentos' using errcode = '42501';
  end if;
  if p_kind not in ('w9', 'insurance_certificate') then
    raise exception 'Tipo de documento no válido' using errcode = '22023';
  end if;
  if not exists (select 1 from profiles where id = p_profile and worker_type = '1099') then
    raise exception 'Solo los empleados 1099 llevan estos documentos' using errcode = '22023';
  end if;
  if p_path is null or p_path not like p_profile::text || '/' || p_kind || '/%' then
    raise exception 'La ruta del archivo no corresponde al empleado' using errcode = '22023';
  end if;
  if p_kind = 'w9' and p_path not like '%.enc' then
    raise exception 'El W-9 se guarda cifrado' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'employee-docs' and name = p_path) then
    raise exception 'El archivo no está en el almacenamiento' using errcode = '22023';
  end if;

  select id into old_id from profile_documents
   where profile_id = p_profile and kind = p_kind and replaced_at is null;
  if old_id is not null then
    update profile_documents set replaced_at = now() where id = old_id;
  end if;

  insert into profile_documents (profile_id, kind, file_path, uploaded_by)
  values (p_profile, p_kind, p_path, me)
  returning id into new_id;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me,
          case when old_id is null then 'documento_subido' else 'documento_reemplazado' end,
          'profile_documents', new_id,
          jsonb_build_object('profile_id', p_profile, 'kind', p_kind, 'reemplaza', old_id));
  return new_id;
end $$;

-- El W-9 firmado en el portal llega cifrado (w9-portal): la ruta termina en .pdf.enc (antes .pdf).
create or replace function w9_portal_sign(p_session_hash text, p_data jsonb, p_tin_type text, p_signer_name text, p_agreed boolean, p_form_version text, p_path text, p_ip text, p_user_agent text, p_signature_id uuid DEFAULT NULL::uuid, p_pdf_sha256 text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
  if coalesce(p_path, '') !~ ('^' || r.profile_id::text || '/w9/signed-' || r.id::text || '-[A-Za-z0-9_-]{8,64}\.pdf\.enc$') then
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
