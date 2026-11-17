-- Orden 120: plantillas de correo para prospectos y clientes (D-321, D-322, D-323; surveys/plantillas-correo-aprobado.html).
-- El Super Admin crea, edita y borra las plantillas en Ajustes → Plantillas de correo; en un lead salen las de
-- prospectos activas y en un cliente las de clientes activas. La app arma el correo (con el pie legal, legal/rev3) y
-- abre la app de correo del dueño con `mailto:`: aquí no se manda ningún correo. Cada "Abrir en mi correo" o
-- "Copiar texto" queda en change_log con log_template_email.

create table email_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  audience   text not null check (audience in ('prospect', 'client')),
  subject    text not null check (btrim(subject) <> ''),
  body       text not null check (btrim(body) <> ''),
  active     boolean not null default true,
  sort       int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
create index email_templates_list on email_templates (audience, sort, created_at);

-- Quién y cuándo los pone la base, no la app.
create function email_templates_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := current_profile_id();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := current_profile_id();
  new.updated_at := now();
  return new;
end $$;
create trigger email_templates_before_write before insert or update on email_templates
  for each row execute function email_templates_before_write();

-- Historial (D-125): creada, editada (incluye activar o desactivar) y eliminada, con el nombre.
create function log_email_template_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(),
          case tg_op when 'INSERT' then 'plantilla_creada' when 'UPDATE' then 'plantilla_editada' else 'plantilla_eliminada' end,
          'email_templates', coalesce(new.id, old.id),
          jsonb_build_object('name', coalesce(new.name, old.name), 'plantilla', coalesce(new.name, old.name),
                             'kind', coalesce(new.audience, old.audience),
                             'active', case when tg_op = 'UPDATE' then new.active end));
  return coalesce(new, old);
end $$;

-- RLS: leen las activas quienes ven leads (prospectos) o clientes (clientes); el Super Admin ve todas y es el único
-- que crea, edita y borra (D-321 (3)). D-200: cada lista con el permiso de su lado.
alter table email_templates enable row level security;
create policy email_templates_read on email_templates for select to authenticated
  using (is_super_admin()
         or (active and audience = 'prospect' and has_permission('leads_ver'))
         or (active and audience = 'client' and has_permission('clientes_ver')));
create policy email_templates_insert on email_templates for insert to authenticated with check (is_super_admin());
create policy email_templates_update on email_templates for update to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy email_templates_delete on email_templates for delete to authenticated using (is_super_admin());
revoke all on email_templates from anon;
grant select, insert, update, delete on email_templates to authenticated;

-- Plantillas iniciales (D-322 (2), D-323 (4)): textos exactos del survey; la lista de clientes empieza vacía.
insert into email_templates (name, audience, subject, body, sort) values
('Primer contacto', 'prospect', 'Commercial cleaning for {empresa}', $t$Hi {nombre},

I'm reaching out from Cid Clean, a commercial cleaning company here in Naples. We clean offices, medical offices, showrooms and warehouses on the schedule that suits each business, usually after hours.

If you'd like, I can visit {dirección} for a free 30-minute walkthrough and send you an exact quote. Would that be useful?

{firma}$t$, 1),
('Seguimiento', 'prospect', 'Re: Commercial cleaning for {empresa}', $t$Hi {nombre},

I'm following up on my note from last week. If cleaning at {empresa} is something you're reviewing, I'd be glad to stop by for a free walkthrough and give you a clear price, with no commitment.

Is there a better person I should talk to about this?

{firma}$t$, 2),
('Seguimiento final', 'prospect', 'Closing the loop', $t$Hi {nombre},

I don't want to fill your inbox, so this is my last note. If you ever need a cleaning quote for {empresa}, just reply to this email and I'll take it from there.

Thanks for your time,

{firma}$t$, 3);
-- El historial empieza después de la siembra (la siembra no es un cambio de nadie).
create trigger email_templates_log after insert or update or delete on email_templates
  for each row execute function log_email_template_change();

-- Datos para llenar la plantilla (D-323 (1), (2)): empresa, contactos con correo (el principal primero; si hay varios se
-- elige), dirección y la firma de quien envía (nombre y teléfono de Mi perfil). Mismo permiso que la lista.
create function template_email_context(p_kind text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_company text;
  v_contacts jsonb := '[]'::jsonb;
  v_address text;
  me profiles;
begin
  select * into me from profiles where id = current_profile_id();
  if me.id is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if p_kind = 'lead' then
    if not has_permission('leads_ver') then raise exception 'No tienes permiso para ver leads' using errcode = '42501'; end if;
    select nullif(btrim(coalesce(company, '')), '') into v_company from leads where id = p_id;
    if not found then raise exception 'El lead no existe' using errcode = 'P0002'; end if;
    select coalesce(nullif(btrim(coalesce(s.address_line1, '')), ''), nullif(btrim(coalesce(s.address, '')), '')) into v_address
      from lead_sites s where s.lead_id = p_id order by s.created_at, s.id limit 1;
    -- Contacto del lead primero; después los contactos de los walkthroughs de sus sitios (D-200).
    select coalesce(jsonb_agg(c order by c_sort), '[]'::jsonb) into v_contacts from (
      select distinct on (lower(coalesce(email, '')), lower(coalesce(name, '')))
             jsonb_build_object('name', name, 'email', email, 'address', addr) c, c_sort
        from (
          select nullif(btrim(coalesce(l.contact_name, '')), '') name, nullif(lower(btrim(coalesce(l.email, ''))), '') email,
                 v_address addr, 0 c_sort
            from leads l where l.id = p_id
          union all
          select nullif(btrim(coalesce(wv.data->'contact'->>'contactName', '')), ''),
                 nullif(lower(btrim(coalesce(wv.data->'contact'->>'email', ''))), ''),
                 coalesce(nullif(btrim(coalesce(s.address_line1, '')), ''), nullif(btrim(coalesce(s.address, '')), '')),
                 1 + row_number() over (order by s.created_at, s.id)
            from lead_sites s
            join walkthroughs w on w.site_id = s.id
            join walkthrough_versions wv on wv.walkthrough_id = w.id and wv.version = w.current_version
           where s.lead_id = p_id
        ) x
       where name is not null or email is not null
       order by lower(coalesce(email, '')), lower(coalesce(name, '')), c_sort
    ) y;
  elsif p_kind = 'client' then
    if not has_permission('clientes_ver') then raise exception 'No tienes permiso para ver clientes' using errcode = '42501'; end if;
    select nullif(btrim(name), ''),
           coalesce(nullif(btrim(coalesce(address_line1, '')), ''), nullif(btrim(coalesce(address, '')), ''))
      into v_company, v_address from clients where id = p_id;
    if not found then raise exception 'El cliente no existe' using errcode = 'P0002'; end if;
    -- Correo del cliente primero; después el contacto principal de cada jobsite activo (D-200).
    select coalesce(jsonb_agg(c order by c_sort), '[]'::jsonb) into v_contacts from (
      select distinct on (lower(coalesce(email, '')), lower(coalesce(name, '')))
             jsonb_build_object('name', name, 'email', email, 'address', addr) c, c_sort
        from (
          select null::text name, nullif(lower(btrim(coalesce(cl.email, ''))), '') email, v_address addr, 0 c_sort
            from clients cl where cl.id = p_id
          union all
          select nullif(btrim(coalesce(j.contact_name, '')), ''), nullif(lower(btrim(coalesce(j.contact_email, ''))), ''),
                 coalesce(nullif(btrim(coalesce(j.address_line1, '')), ''), nullif(btrim(coalesce(j.address, '')), '')),
                 1 + row_number() over (order by j.created_at, j.id)
            from jobsites j where j.client_id = p_id and j.status <> 'terminated'
        ) x
       where name is not null or email is not null
       order by lower(coalesce(email, '')), lower(coalesce(name, '')), c_sort
    ) y;
  else
    raise exception 'Tipo no válido' using errcode = '22023';
  end if;
  return jsonb_build_object('company', v_company, 'address', v_address, 'contacts', v_contacts,
    'sender', jsonb_build_object('name', nullif(btrim(coalesce(me.full_name, '')), ''), 'phone', us_phone_format(me.phone)));
end $$;

-- Registro del envío (D-321 (5), D-323 (1)): fecha, plantilla y quién, en el historial del lead o del cliente.
-- p_via: 'open' (Abrir en mi correo) o 'copy' (Copiar texto). No guarda el correo del destinatario ni el texto.
create function log_template_email(p_template uuid, p_kind text, p_id uuid, p_via text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  t email_templates;
  v_id bigint;
begin
  if current_profile_id() is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if p_via is null or p_via not in ('open', 'copy') then raise exception 'Acción no válida' using errcode = '22023'; end if;
  select * into t from email_templates where id = p_template;
  if t.id is null or not t.active then raise exception 'La plantilla no existe' using errcode = 'P0002'; end if;
  if p_kind = 'lead' then
    if not has_permission('leads_ver') then raise exception 'No tienes permiso para ver leads' using errcode = '42501'; end if;
    if t.audience <> 'prospect' then raise exception 'La plantilla no es para prospectos' using errcode = '22023'; end if;
    if not exists (select 1 from leads where id = p_id) then raise exception 'El lead no existe' using errcode = 'P0002'; end if;
  elsif p_kind = 'client' then
    if not has_permission('clientes_ver') then raise exception 'No tienes permiso para ver clientes' using errcode = '42501'; end if;
    if t.audience <> 'client' then raise exception 'La plantilla no es para clientes' using errcode = '22023'; end if;
    if not exists (select 1 from clients where id = p_id) then raise exception 'El cliente no existe' using errcode = 'P0002'; end if;
  else
    raise exception 'Tipo no válido' using errcode = '22023';
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'correo_plantilla', case p_kind when 'lead' then 'leads' else 'clients' end, p_id,
          jsonb_build_object('template_id', t.id, 'plantilla', t.name, 'kind', p_via))
  returning id into v_id;
  return v_id;
end $$;

-- Línea de tiempo de los correos del lead o del cliente: plantilla, quién y cuándo (más recientes primero).
-- Incluye los recordatorios automáticos del quote (orden 121) del lead.
create function entity_email_log(p_kind text, p_id uuid) returns table(at timestamptz, action text, template text, actor text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'lead' then
    if not has_permission('leads_ver') then raise exception 'No tienes permiso para ver leads' using errcode = '42501'; end if;
  elsif p_kind = 'client' then
    if not has_permission('clientes_ver') then raise exception 'No tienes permiso para ver clientes' using errcode = '42501'; end if;
  else
    raise exception 'Tipo no válido' using errcode = '22023';
  end if;
  return query
    select l.at, l.action, coalesce(l.detail->>'plantilla', l.detail->>'version'), a.full_name
      from change_log l left join profiles a on a.id = l.actor_id
     where l.entity = case p_kind when 'lead' then 'leads' else 'clients' end and l.entity_id = p_id
       and l.action in ('correo_plantilla', 'quote_recordatorio')
     order by l.id desc
     limit 50;
end $$;

-- El historial general muestra el nombre de la plantilla (sin montos, archivos ni correos).
create or replace function change_log_safe_detail(p_detail jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'permiso', p_detail->>'permiso',
    'kind', p_detail->>'kind',
    'version', p_detail->'version',
    'plantilla', p_detail->>'plantilla',
    'label_es', coalesce(p_detail->>'label_es', p_detail->'despues'->>'label_es'),
    'label_en', coalesce(p_detail->>'label_en', p_detail->'despues'->>'label_en'),
    'antes', case when jsonb_typeof(p_detail->'antes') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'role', p_detail->'antes'->'role', 'worker_type', p_detail->'antes'->'worker_type', 'active', p_detail->'antes'->'active',
      'is_super_admin', p_detail->'antes'->'is_super_admin', 'has_app_access', p_detail->'antes'->'has_app_access')) end,
    'despues', case when jsonb_typeof(p_detail->'despues') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'role', p_detail->'despues'->'role', 'worker_type', p_detail->'despues'->'worker_type', 'active', p_detail->'despues'->'active',
      'is_super_admin', p_detail->'despues'->'is_super_admin', 'has_app_access', p_detail->'despues'->'has_app_access')) end
  ))
$$;

revoke all on function email_templates_before_write(), log_email_template_change() from public, anon, authenticated;
revoke all on function template_email_context(text, uuid), log_template_email(uuid, text, uuid, text),
                       entity_email_log(text, uuid) from public, anon;
grant execute on function template_email_context(text, uuid), log_template_email(uuid, text, uuid, text),
                          entity_email_log(text, uuid) to authenticated;
