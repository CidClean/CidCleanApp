-- Hito 3: PDF del resumen del walkthrough (D-212). Se genera al cerrar cada versión y se guarda con ella.
-- Lo arma la Edge Function walkthrough-pdf; esta migración da el bucket privado y la lectura de los datos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('walkthrough-pdfs', 'walkthrough-pdfs', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;
-- Sin políticas para usuarios: solo la función (service role) escribe y firma enlaces de 60 s, después de comprobar
-- con walkthrough_pdf_source que quien llama puede ver el walkthrough.

-- Datos de una versión cerrada para el PDF: empresa, sitio, documento de esa versión y ruta del PDF si ya existe.
-- Corre con la identidad de quien llama: sin permiso para ver walkthroughs, error 42501.
create function walkthrough_pdf_source(p_id uuid, p_version int) returns jsonb
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
           'pdf_path', v.pdf_path)
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

revoke execute on function walkthrough_pdf_source(uuid, int) from public, anon;
grant execute on function walkthrough_pdf_source(uuid, int) to authenticated;
