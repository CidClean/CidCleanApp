-- Orden 58 (D-284, legal rev. 3, tarea 7): las fotos del trabajo y del walkthrough solo las ven usuarios con rol admin
-- (plantilla Admin, D-152) y el Super Admin. Quien no es admin solo ve las suyas mientras las sube (miniatura en la
-- pantalla de carga: el teléfono la muestra desde su archivo local; en el servidor puede leer lo que él mismo subió en
-- las últimas 24 h, para reintentos), no la galería. El bucket sigue privado: solo URLs firmadas y temporales.
-- El PDF del walkthrough lleva el anexo de fotos solo para admins; los demás reciben el PDF sin fotos.
-- El portal del cliente no tiene ningún enlace ni vista de fotos (quote-portal solo entrega SOW, PDF del quote y términos).

create function is_admin_role() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.active and (p.is_super_admin or p.role = 'admin')
                     from profiles p where p.id = current_profile_id()), false)
$$;

update storage.buckets set public = false where id in ('walkthrough-photos', 'walkthrough-pdfs');

drop policy walkthrough_photos_select on storage.objects;
create policy walkthrough_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'walkthrough-photos' and (
    is_admin_role()
    or (owner = auth.uid() and created_at > now() - interval '24 hours')
  ));

-- Datos del PDF: ahora dice si quien llama puede ver las fotos (photos = true solo para admins).
create or replace function walkthrough_pdf_source(p_id uuid, p_version int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
begin
  if not can_see_walkthroughs() then
    raise exception 'No tienes permiso para ver walkthroughs' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'company', l.company,
           'site_name', s.name,
           'site_address', s.address,
           'version', v.version,
           'closed_at', v.created_at,
           'data', v.data,
           'pdf_path', v.pdf_path,
           'photos', is_admin_role())
    into r
    from walkthrough_versions v
    join walkthroughs w on w.id = v.walkthrough_id
    join lead_sites s on s.id = w.site_id
    join leads l on l.id = s.lead_id
   where v.walkthrough_id = p_id and v.version = p_version;
  if r is null then
    raise exception 'La versión no existe' using errcode = 'P0002';
  end if;
  return r;
end $$;

revoke execute on function is_admin_role() from public, anon;
grant  execute on function is_admin_role() to authenticated;
