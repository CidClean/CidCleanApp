-- D-260: el W-9 de un 1099 (firmado por el portal o subido) solo lo abre y descarga el Super Admin.
-- Quien tiene empleados_gestionar_documentos sigue abriendo el certificado de seguro. El resto es igual a 20261021000008.
create or replace function open_profile_document(doc_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  doc profile_documents;
begin
  if not has_permission('empleados_gestionar_documentos') then
    raise exception 'No tienes permiso para ver documentos' using errcode = '42501';
  end if;
  select * into doc from profile_documents where id = doc_id;
  if not found then
    raise exception 'Documento no encontrado' using errcode = 'P0002';
  end if;
  if doc.kind = 'w9' and not is_super_admin() then
    raise exception 'Solo el Super Admin puede abrir el W-9' using errcode = '42501';
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'documento_abierto', 'profile_documents', doc.id,
          jsonb_build_object('profile_id', doc.profile_id, 'kind', doc.kind));
  return doc.file_path;
end $$;
