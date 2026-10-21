-- Términos del staff en PDF (D-176, D-179, D-187).
-- El Super Admin publica cada versión subiendo el PDF del abogado; el staff lo lee como PDF.
-- terms_documents guarda la ruta del archivo en el bucket privado `terms` en lugar del texto.

-- La tabla debe estar vacía: nunca se publicó una versión en texto.
do $$
begin
  if exists (select 1 from terms_documents) then
    raise exception 'terms_documents no está vacía: no se puede cambiar body por file_path';
  end if;
end $$;

alter table terms_documents drop column body;
alter table terms_documents add column file_path text not null;

-- Bucket privado: cualquier usuario autenticado lee; solo el Super Admin sube. Sin política de update ni delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('terms', 'terms', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create policy terms_select on storage.objects for select to authenticated
  using (bucket_id = 'terms');
create policy terms_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'terms' and is_super_admin());

-- Publicar una versión nueva: solo el Super Admin (D-168). Ahora recibe la ruta del PDF ya subido.
drop function publish_terms(text, text);
create function publish_terms(kind text, file_path text) returns void
language plpgsql security definer set search_path = public as $$
declare
  next_version int;
  new_id uuid;
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin publica términos' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'terms' and o.name = publish_terms.file_path) then
    raise exception 'El archivo no existe en el bucket de términos' using errcode = '22023';
  end if;
  select coalesce(max(t.version), 0) + 1 into next_version from terms_documents t where t.kind = publish_terms.kind;
  insert into terms_documents (kind, version, file_path, published_by)
  values (publish_terms.kind, next_version, publish_terms.file_path, current_profile_id())
  returning id into new_id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'terminos_publicados', 'terms_documents', new_id,
          jsonb_build_object('kind', publish_terms.kind, 'version', next_version, 'file_path', publish_terms.file_path));
end $$;

-- Versión vigente de un tipo de términos: versión, fecha y ruta del PDF (ninguna fila si no hay).
create function get_current_terms(p_kind text)
returns table (version int, published_at timestamptz, file_path text)
language sql stable security invoker set search_path = public as $$
  select t.version, t.published_at, t.file_path
  from terms_documents t
  where t.kind = p_kind
  order by t.version desc
  limit 1
$$;

revoke execute on function publish_terms(text, text), get_current_terms(text) from public, anon;
grant  execute on function publish_terms(text, text), get_current_terms(text) to authenticated;
