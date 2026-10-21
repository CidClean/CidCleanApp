-- Términos y condiciones con versiones (D-086, D-168).
-- Cada documento publicado (staff, portal, privacidad) y cada aceptación (quién, qué versión, cuándo) quedan guardados.
-- No se publica ningún texto aquí: lo redacta el abogado y lo publica el Super Admin con publish_terms().

create table terms_documents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('staff', 'portal', 'privacy')),
  version      int  not null,
  body         text not null,
  published_at timestamptz not null default now(),
  published_by uuid references profiles(id),
  unique (kind, version)
);

create table terms_acceptances (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references profiles(id),
  document_id uuid not null references terms_documents(id),
  accepted_at timestamptz not null default now(),
  unique (profile_id, document_id)
);

-- Solo se agrega: nadie edita ni borra (como change_log, D-139).
create function terms_append_only() returns trigger
language plpgsql set search_path = public as $$
begin raise exception 'Los términos y sus aceptaciones no se editan ni se borran'; end $$;
create trigger terms_documents_no_change before update or delete on terms_documents
  for each row execute function terms_append_only();
create trigger terms_acceptances_no_change before update or delete on terms_acceptances
  for each row execute function terms_append_only();

-- Reglas por fila.
alter table terms_documents   enable row level security;
alter table terms_acceptances enable row level security;

create policy terms_documents_read on terms_documents for select to authenticated using (true);
create policy terms_acceptances_read on terms_acceptances for select to authenticated
  using (profile_id = current_profile_id() or has_permission('empleados_ver'));

-- Sin políticas de escritura: todo cambio pasa por las funciones de abajo.
revoke all on terms_documents, terms_acceptances from anon;
revoke insert, update, delete, truncate, references, trigger on terms_documents, terms_acceptances from authenticated;

-- Aceptar los términos del staff: registra la última versión publicada para el perfil actual.
create function accept_staff_terms() returns void
language plpgsql security definer set search_path = public as $$
declare
  doc terms_documents%rowtype;
  me  uuid := current_profile_id();
  n   int;
begin
  if me is null then return; end if;
  select * into doc from terms_documents where kind = 'staff' order by version desc limit 1;
  if not found then return; end if;
  insert into terms_acceptances (profile_id, document_id) values (me, doc.id)
  on conflict (profile_id, document_id) do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (me, 'terminos_aceptados', 'terms_documents', doc.id,
            jsonb_build_object('kind', doc.kind, 'version', doc.version));
  end if;
end $$;

-- Publicar una versión nueva: solo el Super Admin (D-168).
create function publish_terms(kind text, body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  next_version int;
  new_id uuid;
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin publica términos' using errcode = '42501';
  end if;
  select coalesce(max(t.version), 0) + 1 into next_version from terms_documents t where t.kind = publish_terms.kind;
  insert into terms_documents (kind, version, body, published_by)
  values (publish_terms.kind, next_version, publish_terms.body, current_profile_id())
  returning id into new_id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'terminos_publicados', 'terms_documents', new_id,
          jsonb_build_object('kind', publish_terms.kind, 'version', next_version));
end $$;

revoke execute on function accept_staff_terms(), publish_terms(text, text) from public, anon;
grant  execute on function accept_staff_terms(), publish_terms(text, text) to authenticated;

-- El disparador de solo agregar no se llama desde la API.
revoke execute on function terms_append_only() from public, anon, authenticated;

-- Reemplaza la marca única de la etapa 1 (D-168): ya no se usan.
drop function accept_terms();
alter table profiles drop column terms_accepted_at;
