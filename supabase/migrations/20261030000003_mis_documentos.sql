-- Orden 48 (D-263, D-271): "Mis documentos" del empleado 1099 con acceso a la app.
-- El dueño del documento (el perfil activo de quien entra) puede:
--   * listar sus propios documentos (profile_documents);
--   * abrir su W-9 y su certificado (open_profile_document; cada apertura sigue en el historial, D-125);
--   * subir su certificado de seguro a su carpeta de employee-docs y registrarlo (register_profile_document, solo
--     kind insurance_certificate; reemplaza al anterior y queda en el historial).
-- Nadie más que él y el Super Admin abre su W-9 (D-260 sigue para los demás admins).

drop policy profile_documents_read on profile_documents;
create policy profile_documents_read on profile_documents for select to authenticated
  using (has_permission('empleados_gestionar_documentos') or profile_id = current_profile_id());

-- Subir: quien gestiona documentos (como antes) o el propio empleado, solo en <su id>/insurance_certificate/.
drop policy employee_docs_insert on storage.objects;
create policy employee_docs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'employee-docs' and (
      has_permission('empleados_gestionar_documentos')
      or ((storage.foldername(name))[1] = current_profile_id()::text
          and (storage.foldername(name))[2] = 'insurance_certificate')
    )
  );

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

create or replace function open_profile_document(doc_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  doc profile_documents;
  me uuid := current_profile_id();
begin
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
  values (me, 'documento_abierto', 'profile_documents', doc.id,
          jsonb_build_object('profile_id', doc.profile_id, 'kind', doc.kind));
  return doc.file_path;
end $$;
