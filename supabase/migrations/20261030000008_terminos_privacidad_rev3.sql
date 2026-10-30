-- Orden 56 (D-282, legal rev. 3): términos del staff y Política de Privacidad.
-- * La Política de Privacidad ('privacy') se publica como los términos (D-176, D-187), con la opción "cambio importante":
--   si es importante, todo el staff con acceso a la app (menos el Super Admin) tiene que aceptarla; si no, solo se avisa.
-- * Cada aceptación guarda versión, fecha y hora, IP y navegador o dispositivo. La IP sale de las cabeceras que pone el
--   servidor (PostgREST: request.headers; cf-connecting-ip primero), nunca de un dato que mande la app.
-- * Al publicar, aviso en la app y por correo (send-notifications, en inglés con la plantilla de D-250) a cada persona
--   que debe aceptarla (o a quien solo se avisa, si el cambio de privacidad no es importante).

-- Cambio importante: los términos del staff y del portal siempre lo son; la privacidad lo decide el Super Admin.
alter table terms_documents add column major boolean not null default true;

alter table terms_acceptances add column ip text;
alter table terms_acceptances add column user_agent text;

-- IP y navegador de la petición actual, de las cabeceras que agrega el servidor (null fuera de la API).
create function request_client_meta(out ip text, out user_agent text)
language plpgsql stable set search_path = public as $$
declare
  h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;
  if h is null then return; end if;
  ip := left(coalesce(nullif(btrim(h->>'cf-connecting-ip'), ''),
                      nullif(btrim(split_part(h->>'x-forwarded-for', ',', 1)), ''),
                      nullif(btrim(h->>'x-real-ip'), '')), 64);
  user_agent := left(nullif(h->>'user-agent', ''), 400);
end $$;

-- Lo que la persona actual tiene que aceptar: la última versión del staff y la última versión importante de la
-- privacidad (la acepta también quien aceptó una versión posterior). El Super Admin no acepta (D-176).
create function my_terms_status()
returns table (document_id uuid, kind text, version int, accepted boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id from profiles p where p.id = current_profile_id() and not p.is_super_admin
  ), staff as (
    select t.* from terms_documents t where t.kind = 'staff' order by t.version desc limit 1
  ), privacy as (
    select t.* from terms_documents t where t.kind = 'privacy' and t.major order by t.version desc limit 1
  )
  select s.id, s.kind, s.version,
         exists (select 1 from terms_acceptances a, me where a.profile_id = me.id and a.document_id = s.id)
    from staff s, me
  union all
  select v.id, v.kind, v.version,
         exists (select 1 from terms_acceptances a join terms_documents t on t.id = a.document_id, me
                  where a.profile_id = me.id and t.kind = 'privacy' and t.version >= v.version)
    from privacy v, me
$$;

-- Aceptar: registra lo pendiente (staff y privacidad) con versión, fecha y hora, IP y navegador.
drop function accept_staff_terms();
create function accept_pending_terms() returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  m record;
  r record;
  n int := 0;
  k int;
begin
  if me is null then return 0; end if;
  select * into m from request_client_meta();
  for r in
    select s.document_id, s.kind, s.version from my_terms_status() s where not s.accepted
  loop
    -- La privacidad se acepta en su última versión publicada (puede haber una posterior que no era importante).
    if r.kind = 'privacy' then
      select t.id, t.version into r.document_id, r.version from terms_documents t
       where t.kind = 'privacy' order by t.version desc limit 1;
    end if;
    insert into terms_acceptances (profile_id, document_id, ip, user_agent)
    values (me, r.document_id, m.ip, m.user_agent)
    on conflict (profile_id, document_id) do nothing;
    get diagnostics k = row_count;
    if k > 0 then
      n := n + 1;
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (me, 'terminos_aceptados', 'terms_documents', r.document_id,
              jsonb_build_object('kind', r.kind, 'version', r.version, 'ip', m.ip));
    end if;
  end loop;
  return n;
end $$;

-- Publicar: solo el Super Admin. p_major solo cuenta para la privacidad.
drop function publish_terms(text, text);
create function publish_terms(kind text, file_path text, major boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare
  next_version int;
  new_id uuid;
  v_major boolean := publish_terms.kind <> 'privacy' or coalesce(publish_terms.major, true);
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin publica términos' using errcode = '42501';
  end if;
  if publish_terms.kind not in ('staff', 'portal', 'privacy') then
    raise exception 'Tipo de documento no válido' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'terms' and o.name = publish_terms.file_path) then
    raise exception 'El archivo no existe en el bucket de términos' using errcode = '22023';
  end if;
  select coalesce(max(t.version), 0) + 1 into next_version from terms_documents t where t.kind = publish_terms.kind;
  insert into terms_documents (kind, version, file_path, published_by, major)
  values (publish_terms.kind, next_version, publish_terms.file_path, current_profile_id(), v_major)
  returning id into new_id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'terminos_publicados', 'terms_documents', new_id,
          jsonb_build_object('kind', publish_terms.kind, 'version', next_version, 'file_path', publish_terms.file_path,
                             'major', v_major));
end $$;

-- Vigente de un tipo, ahora con la marca de cambio importante.
drop function get_current_terms(text);
create function get_current_terms(p_kind text)
returns table (version int, published_at timestamptz, file_path text, major boolean)
language sql stable security invoker set search_path = public as $$
  select t.version, t.published_at, t.file_path, t.major
  from terms_documents t
  where t.kind = p_kind
  order by t.version desc
  limit 1
$$;

-- Aviso al publicar: términos del staff (por aceptar) y privacidad (por aceptar si es importante; si no, solo aviso).
create or replace function notify_terms_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind not in ('staff', 'privacy') then return new; end if;
  begin
    perform notify_profiles(array(select id from profiles where active and has_app_access and not is_super_admin),
      case when new.kind = 'staff' then 'terms_new' else 'privacy_new' end,
      jsonb_build_object('version', new.version, 'major', new.major), jsonb_build_object('pathname', '/'), false,
      'terms:' || new.id);
  exception when others then null;
  end;
  return new;
end $$;

-- Textos del aviso nuevo (D-200): bandeja en el idioma del perfil; el correo va en inglés (D-247).
create or replace function notification_text(p_kind text, d jsonb, lang text, out title text, out detail text)
language plpgsql stable set search_path = public as $$
declare
  es boolean := lang = 'es';
  place text := concat_ws(' · ', nullif(d->>'company', ''), nullif(d->>'site', ''));
  day text := case when d ? 'day' then cc_short_date((d->>'day')::date, lang) end;
begin
  case p_kind
    when 'quote_viewed' then title := case when es then 'Quote visto' else 'Quote viewed' end; detail := place;
    when 'quote_accepted' then title := case when es then 'Quote aceptado' else 'Quote accepted' end; detail := place;
    when 'quote_rejected' then title := case when es then 'Quote rechazado' else 'Quote rejected' end; detail := place;
    when 'quote_changes' then title := case when es then 'Nueva versión solicitada' else 'New version requested' end; detail := place;
    when 'quote_expiring' then
      title := case when es then 'Quote por vencer' else 'Quote expiring' end;
      detail := concat_ws(' · ', place, case when es then 'vence el ' else 'expires ' end || day);
    when 'quote_expired' then title := case when es then 'Quote expirado' else 'Quote expired' end; detail := place;
    when 'walkthrough_scheduled' then
      title := case when es then 'Walkthrough agendado' else 'Walkthrough scheduled' end;
      detail := concat_ws(' · ', place, day || ' ' || coalesce(d->>'time', ''));
    when 'followup_due' then title := case when es then 'Seguimiento de lead pendiente' else 'Lead follow-up due' end; detail := d->>'company';
    when 'schedule_changed' then
      title := case when es then 'Horario nuevo o cambiado' else 'New or changed schedule' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'schedule_removed' then
      title := case when es then 'Te quitaron de una visita' else 'You were removed from a visit' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'visit_soon' then
      title := case when es then 'Visita en las próximas horas' else 'Visit in the next few hours' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'time');
    when 'work_to_approve' then
      title := case when es then 'Trabajo pendiente de aprobar' else 'Work pending approval' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'gps_out' then
      title := case when es then 'Clock in con GPS fuera de rango' else 'Clock in with GPS out of range' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'name');
    when 'clock_in_forgotten' then
      title := case when es then 'Clock in olvidado' else 'Forgotten clock in' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'name');
    when 'clock_out_forgotten' then
      title := case when es then 'Clock out olvidado' else 'Forgotten clock out' end;
      detail := concat_ws(' · ', d->>'jobsite', d->>'name', day);
    when 'work_approved' then
      title := case when es then 'Trabajo aprobado' else 'Work approved' end;
      detail := concat_ws(' · ', d->>'jobsite', day);
    when 'income_unmarked' then
      title := case when es then 'Ingreso esperado sin marcar como recibido' else 'Expected income not marked as received' end;
      detail := (d->>'count') || case when es then ' de ' else ' in ' end || cc_month_name((d->>'month')::date, lang);
    when 'margin_alert' then title := case when es then 'Alerta de margen' else 'Margin alert' end; detail := d->>'jobsite';
    when 'recurring_generated' then
      title := case when es then 'Gasto recurrente generado' else 'Recurring expense created' end;
      detail := concat_ws(' · ', d->>'name', '$' || to_char((d->>'amount')::numeric, 'FM999,999,990.00'));
    when 'hours_32' then
      title := case when es then 'Alerta de 32 h semanales' else '32 h weekly alert' end;
      detail := (d->>'name') || case when es then ' lleva ' else ' has ' end || (d->>'hours') || ' h';
    when 'permissions_changed' then
      title := case when es then 'Cambio de permisos' else 'Permissions changed' end;
      detail := case when es then 'Revisa lo que puedes ver en la app.' else 'Check what you can see in the app.' end;
    when 'terms_new' then
      title := case when es then 'Nueva versión de términos y condiciones por aceptar' else 'New terms and conditions to accept' end;
      detail := (case when es then 'Versión ' else 'Version ' end) || (d->>'version');
    -- D-200: Política de Privacidad nueva; "por aceptar" solo si es un cambio importante.
    when 'privacy_new' then
      title := case when coalesce((d->>'major')::boolean, true)
                    then case when es then 'Nueva Política de Privacidad por aceptar' else 'New Privacy Policy to accept' end
                    else case when es then 'Política de Privacidad actualizada' else 'Privacy Policy updated' end end;
      detail := (case when es then 'Versión ' else 'Version ' end) || (d->>'version');
    when 'w9_signed' then
      title := case when es then 'W-9 firmado' else 'W-9 signed' end;
      detail := d->>'name';
    -- Orden 57 (D-282): solicitud de eliminación de cuenta, al Super Admin.
    when 'account_deletion_requested' then
      title := case when es then 'Solicitud de eliminación de cuenta' else 'Account deletion request' end;
      detail := d->>'name';
    else title := p_kind; detail := null;
  end case;
end $$;

revoke execute on function request_client_meta() from public, anon, authenticated;
revoke execute on function my_terms_status(), accept_pending_terms(), publish_terms(text, text, boolean), get_current_terms(text) from public, anon;
grant  execute on function my_terms_status(), accept_pending_terms(), publish_terms(text, text, boolean), get_current_terms(text) to authenticated;
