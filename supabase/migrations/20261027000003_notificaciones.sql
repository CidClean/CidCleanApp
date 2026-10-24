-- Hito 7, orden 28: avisos (notificaciones).
-- Fuente: current/flujo.md ("Notificaciones", corregida en D-238), D-084, D-085, D-117, D-118, D-214, D-215, D-223.
-- D-215: por ahora solo correo y dentro de la app (push más adelante); los tres canales encendidos por defecto y
-- elegibles en el perfil; correo desde no-reply@auth.cidclean.com; eventos inmediatos y resumen diario a las 8:00 AM
-- (hora de Naples) para lo acumulado; visita próxima 2 h antes; ingreso esperado sin marcar se avisa a fin de mes;
-- el staff sin acceso a la app no recibe avisos. Cada aviso llega solo a quien tiene el permiso relacionado (o a la
-- persona de quien se trata: su horario, su trabajo, sus permisos).
-- Los avisos se crean en la base (disparadores y notifications_scan cada 15 minutos con pg_cron). El correo lo manda
-- la Edge Function send-notifications (código en supabase/functions, sin desplegar), que llama a
-- claim_notification_emails y mark_notification_emails con la service role.

-- Canales de cada persona (D-085): Push, Email y En la app, encendidos por defecto (D-215).
create table notification_settings (
  profile_id uuid primary key references profiles(id) on delete cascade,
  push       boolean not null default true,
  email      boolean not null default true,
  in_app     boolean not null default true,
  updated_at timestamptz not null default now()
);

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  kind         text not null,
  data         jsonb not null default '{}'::jsonb,
  -- Pantalla que abre (D-118): {"pathname": "...", "params": {...}}.
  link         jsonb,
  -- Lo acumulado va en el resumen diario de las 8:00 AM; lo demás se envía al momento (D-215).
  digest       boolean not null default false,
  in_app       boolean not null default true,
  email_status text not null default 'none' check (email_status in ('none', 'pending', 'sending', 'sent', 'failed')),
  dedupe       text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  emailed_at   timestamptz,
  unique (profile_id, dedupe)
);
create index notifications_mine on notifications (profile_id, created_at desc);
create index notifications_email on notifications (email_status, digest) where email_status in ('pending', 'sending');

alter table notification_settings enable row level security;
alter table notifications enable row level security;
-- Cada uno ve los suyos; nada se escribe directo.
create policy notifications_read on notifications for select to authenticated using (profile_id = current_profile_id());
create policy notification_settings_read on notification_settings for select to authenticated using (profile_id = current_profile_id());
revoke all on notification_settings, notifications from anon;
revoke insert, update, delete, truncate, references, trigger on notification_settings, notifications from authenticated;

-- Textos (D-200): una sola fuente para la bandeja y el correo, en el idioma de cada persona. -----------------------

create function cc_short_date(p date, lang text) returns text language sql immutable as $$
  select case when lang = 'es'
    then extract(day from p)::int || ' ' || (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from p)::int]
    else (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from p)::int] || ' ' || extract(day from p)::int end
$$;
create function cc_time(p timestamptz) returns text language sql stable set search_path = public as $$
  select ltrim(to_char(p at time zone cc_tz(), 'HH12:MI AM'), '0')
$$;
create function cc_month_name(p date, lang text) returns text language sql immutable as $$
  select case when lang = 'es'
    then (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from p)::int]
    else (array['January','February','March','April','May','June','July','August','September','October','November','December'])[extract(month from p)::int] end
    || ' ' || extract(year from p)::int
$$;

create function notification_text(p_kind text, d jsonb, lang text, out title text, out detail text)
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
    else title := p_kind; detail := null;
  end case;
end $$;

-- Crear avisos ---------------------------------------------------------------------------------------------------

-- A personas concretas (su horario, su trabajo, sus permisos). Solo activas y con acceso a la app (D-215); cada
-- canal según su perfil (D-085); con ambos canales apagados no se crea. dedupe evita repetir el mismo aviso.
create function notify_profiles(p_profiles uuid[], p_kind text, p_data jsonb, p_link jsonb, p_digest boolean, p_dedupe text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  insert into notifications (profile_id, kind, data, link, digest, in_app, email_status, dedupe)
  select p.id, p_kind, coalesce(p_data, '{}'::jsonb), p_link, coalesce(p_digest, false), coalesce(s.in_app, true),
         case when coalesce(s.email, true) and p.email is not null then 'pending' else 'none' end, p_dedupe
    from profiles p left join notification_settings s on s.profile_id = p.id
   where p.id = any (p_profiles) and p.active and p.has_app_access
     and (coalesce(s.in_app, true) or coalesce(s.email, true))
  on conflict (profile_id, dedupe) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Quién tiene todos los permisos de la lista (o es el Super Admin), activo y con acceso a la app.
create function profiles_with(p_perms text[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from profiles p
   where p.active and p.has_app_access
     and (p.is_super_admin or not exists (
           select 1 from unnest(p_perms) k
            where not exists (select 1 from profile_permissions pp where pp.profile_id = p.id and pp.permission_key = k)))
$$;

-- A quien tiene el permiso relacionado (tabla de Notificaciones de flujo.md), sin avisarle a quien hizo el cambio.
create function notify_permission(p_perms text[], p_kind text, p_data jsonb, p_link jsonb, p_digest boolean, p_dedupe text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := current_profile_id();
begin
  return notify_profiles(array(select x from profiles_with(p_perms) x where v_actor is null or x <> v_actor),
                         p_kind, p_data, p_link, p_digest, p_dedupe);
end $$;

-- Eventos inmediatos (disparadores). Un fallo del aviso nunca hace fallar el cambio que lo originó. -----------------

-- Ventas: quote visto, aceptado, rechazado o con cambios pedidos (incluye los extras, D-238).
create function notify_quote_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  v_kind text;
  v_data jsonb;
  v_link jsonb;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_kind := case new.status when 'viewed' then 'quote_viewed' when 'accepted' then 'quote_accepted'
                            when 'rejected' then 'quote_rejected' when 'changes_requested' then 'quote_changes' end;
  if v_kind is null then return new; end if;
  begin
    select * into q from quotes where id = new.quote_id;
    if q.kind = 'extra' then
      select jsonb_build_object('company', c.name, 'site', j.name, 'version', quote_version_label(new.minor)) into v_data
        from jobsites j join clients c on c.id = j.client_id where j.id = q.jobsite_id;
      v_link := jsonb_build_object('pathname', '/jobsites/[id]', 'params', jsonb_build_object('id', q.jobsite_id));
    else
      select jsonb_build_object('company', l.company, 'site', coalesce(nullif(btrim(s.name), ''), s.address),
                                'version', quote_version_label(new.minor)) into v_data
        from leads l join lead_sites s on s.id = q.site_id where l.id = q.lead_id;
      v_link := jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', q.lead_id));
    end if;
    perform notify_permission(array['quotes_ver'], v_kind, v_data, v_link, false, v_kind || ':' || new.id);
  exception when others then null;
  end;
  return new;
end $$;
create trigger quote_versions_notify after update of status on quote_versions for each row execute function notify_quote_status();

-- Ventas: walkthrough agendado (a quien hace walkthroughs).
create function notify_walkthrough_scheduled() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'scheduled' or (tg_op = 'UPDATE' and old.status = 'scheduled' and old.starts_at = new.starts_at) then return new; end if;
  begin
    perform notify_permission(array['walkthroughs_hacer'], 'walkthrough_scheduled',
      (select jsonb_build_object('company', l.company, 'site', coalesce(nullif(btrim(s.name), ''), s.address),
                                 'day', local_day(new.starts_at), 'time', cc_time(new.starts_at))
         from lead_sites s join leads l on l.id = s.lead_id where s.id = new.site_id),
      (select jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', s.lead_id)) from lead_sites s where s.id = new.site_id),
      false, 'wt:' || new.id || ':' || new.starts_at);
  exception when others then null;
  end;
  return new;
end $$;
create trigger walkthrough_appointments_notify after insert or update on walkthrough_appointments
  for each row execute function notify_walkthrough_scheduled();

-- Schedule: horario nuevo o cambiado, y quitado de una visita, a la persona (solo esta semana y la siguiente, que es
-- lo que el staff ve, D-012). Uno por persona y día para no repetir al guardar una semana entera.
create function notify_visit_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  r visit_staff;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  begin
    select * into v from visits where id = r.visit_id;
    if v.id is null or v.removed or v.local_date < cc_today() or v.local_date > week_monday(cc_today()) + 13 then return null; end if;
    perform notify_profiles(array[r.profile_id], case when tg_op = 'DELETE' then 'schedule_removed' else 'schedule_changed' end,
      jsonb_build_object('jobsite', (select name from jobsites where id = v.jobsite_id), 'day', v.local_date),
      jsonb_build_object('pathname', '/'), false,
      (case when tg_op = 'DELETE' then 'schrm:' else 'sch:' end) || cc_today() || ':' || v.id);
  exception when others then null;
  end;
  return null;
end $$;
create trigger visit_staff_notify after insert or delete on visit_staff for each row execute function notify_visit_staff();

-- Schedule: cambiar la hora o la duración de una visita avisa a su personal.
create function notify_visit_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (old.starts_at, old.minutes, old.removed) is not distinct from (new.starts_at, new.minutes, new.removed) or (old.removed and new.removed) then
    return new;
  end if;
  begin
    -- Quitar la visita del schedule (D-011, D-230) avisa como "quitado de una visita".
    if new.removed and new.local_date between cc_today() and week_monday(cc_today()) + 13 then
      perform notify_profiles(array(select profile_id from visit_staff where visit_id = new.id), 'schedule_removed',
        jsonb_build_object('jobsite', (select name from jobsites where id = new.jobsite_id), 'day', new.local_date),
        jsonb_build_object('pathname', '/'), false, 'schrm:' || cc_today() || ':' || new.id);
    elsif new.local_date between cc_today() and week_monday(cc_today()) + 13 then
      perform notify_profiles(array(select profile_id from visit_staff where visit_id = new.id), 'schedule_changed',
        jsonb_build_object('jobsite', (select name from jobsites where id = new.jobsite_id), 'day', new.local_date),
        jsonb_build_object('pathname', '/'), false, 'schc:' || new.id || ':' || new.starts_at || ':' || new.minutes);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
create trigger visits_notify_changed after update on visits for each row execute function notify_visit_changed();

-- Work: clock in o out con GPS fuera de rango (a quien revisa el GPS).
create function notify_gps_out() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (new.in_status = 'out_of_range' or new.out_status = 'out_of_range') then return new; end if;
  begin
    perform notify_permission(array['work_revisar_gps'], 'gps_out',
      (select jsonb_build_object('jobsite', j.name, 'name', p.full_name, 'day', v.local_date)
         from visits v join jobsites j on j.id = v.jobsite_id, profiles p where v.id = new.visit_id and p.id = new.profile_id),
      jsonb_build_object('pathname', '/schedule/work/[id]', 'params', jsonb_build_object('id', new.visit_id)), false, 'gps:' || new.id);
  exception when others then null;
  end;
  return new;
end $$;
create trigger work_entries_notify_gps after insert or update of in_status, out_status on work_entries
  for each row execute function notify_gps_out();

-- Work: trabajo aprobado, a cada persona que trabajó.
create function notify_work_approved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.approved_at is not null or new.approved_at is null then return new; end if;
  begin
    perform notify_profiles(array(select profile_id from work_entries where visit_id = new.id), 'work_approved',
      jsonb_build_object('jobsite', (select name from jobsites where id = new.jobsite_id), 'day', new.local_date),
      jsonb_build_object('pathname', '/'), false, 'approved:' || new.id);
  exception when others then null;
  end;
  return new;
end $$;
create trigger visits_notify_approved after update of approved_at on visits for each row execute function notify_work_approved();

-- Accounting: gasto recurrente generado (a quien gestiona los recurrentes).
create function notify_recurring_generated() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recurring_id is null then return new; end if;
  begin
    perform notify_permission(array['gastos_recurrentes'], 'recurring_generated',
      jsonb_build_object('name', (select name from recurring_expenses where id = new.recurring_id), 'amount', new.amount, 'day', new.spent_on),
      jsonb_build_object('pathname', '/accounting/expenses',
                         'params', jsonb_build_object('from', to_char(new.spent_on, 'YYYY-MM'), 'to', to_char(new.spent_on, 'YYYY-MM'))),
      false, 'rec:' || new.id);
  exception when others then null;
  end;
  return new;
end $$;
create trigger expenses_notify_recurring after insert on expenses for each row execute function notify_recurring_generated();

-- Sistema: cambio de permisos (a la persona; uno por día).
create function notify_permissions_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
begin
  begin
    if v_profile is distinct from current_profile_id() then
      perform notify_profiles(array[v_profile], 'permissions_changed', '{}'::jsonb, jsonb_build_object('pathname', '/'), false,
                              'perm:' || cc_today());
    end if;
  exception when others then null;
  end;
  return null;
end $$;
create trigger profile_permissions_notify after insert or delete on profile_permissions
  for each row execute function notify_permissions_changed();

-- Sistema: nueva versión de los términos del staff por aceptar (a todo el staff con acceso, menos el Super Admin).
create function notify_terms_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'staff' then return new; end if;
  begin
    perform notify_profiles(array(select id from profiles where active and has_app_access and not is_super_admin), 'terms_new',
      jsonb_build_object('version', new.version), jsonb_build_object('pathname', '/'), false, 'terms:' || new.id);
  exception when others then null;
  end;
  return new;
end $$;
create trigger terms_documents_notify after insert on terms_documents for each row execute function notify_terms_new();

-- Lo que se revisa cada 15 minutos (pg_cron) ------------------------------------------------------------------------
-- Visita próxima 2 h antes; clock in olvidado a los 30 min (D-214); clock out olvidado (turno abierto de un día
-- anterior); quotes por vencer (3 días, D-131) o expirados; seguimientos de lead pendientes; trabajos por aprobar;
-- alerta de margen; alerta de 32 h (desde 28 h, D-214, solo a quien arma el schedule, D-223) e ingreso esperado sin
-- marcar el último día del mes desde las 8:00 AM (D-215). Lo acumulado va al resumen diario.
create function notifications_scan() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
  v_today date := cc_today();
  v_sunday date := week_monday(cc_today());
begin
  perform expire_quotes();

  for r in
    select v.id, v.starts_at, j.name jobsite, s.profile_id from visits v join jobsites j on j.id = v.jobsite_id join visit_staff s on s.visit_id = v.id
     where not v.removed and v.starts_at > now() and v.starts_at <= now() + interval '2 hours'
  loop
    n := n + notify_profiles(array[r.profile_id], 'visit_soon', jsonb_build_object('jobsite', r.jobsite, 'time', cc_time(r.starts_at)),
                             jsonb_build_object('pathname', '/'), false, 'soon:' || r.id);
  end loop;

  for r in
    select v.id, j.name jobsite, p.full_name, s.profile_id from visit_staff s join visits v on v.id = s.visit_id
      join jobsites j on j.id = v.jobsite_id join profiles p on p.id = s.profile_id
     where not v.removed and v.local_date = v_today and v.starts_at + interval '30 minutes' <= now()
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id)
  loop
    n := n + notify_permission(array['work_registrar_por_otros'], 'clock_in_forgotten', jsonb_build_object('jobsite', r.jobsite, 'name', r.full_name),
                               jsonb_build_object('pathname', '/schedule', 'params', jsonb_build_object('tab', 'schedule')), false,
                               'cin:' || r.id || ':' || r.profile_id);
  end loop;

  for r in
    select w.id, j.name jobsite, p.full_name, v.local_date from work_entries w join visits v on v.id = w.visit_id
      join jobsites j on j.id = v.jobsite_id join profiles p on p.id = w.profile_id
     where w.clock_out is null and v.local_date < v_today
  loop
    n := n + notify_permission(array['work_editar'], 'clock_out_forgotten', jsonb_build_object('jobsite', r.jobsite, 'name', r.full_name, 'day', r.local_date),
                               jsonb_build_object('pathname', '/schedule', 'params', jsonb_build_object('tab', 'approve')), false, 'cout:' || r.id);
  end loop;

  for r in
    select v.id, v.status, v.expires_at, q.kind, q.lead_id, q.jobsite_id,
           coalesce(l.company, c.name) company, coalesce(nullif(btrim(s.name), ''), s.address, j.name) site
      from quote_versions v join quotes q on q.id = v.quote_id
      left join leads l on l.id = q.lead_id left join lead_sites s on s.id = q.site_id
      left join jobsites j on j.id = q.jobsite_id left join clients c on c.id = j.client_id
     where (v.status in ('sent', 'viewed') and v.expires_at <= now() + interval '3 days')
        or (v.status = 'expired' and v.expires_at > now() - interval '2 days')
  loop
    n := n + notify_permission(array['quotes_ver'], case when r.status = 'expired' then 'quote_expired' else 'quote_expiring' end,
      jsonb_build_object('company', r.company, 'site', r.site, 'day', local_day(r.expires_at)),
      case when r.kind = 'extra' then jsonb_build_object('pathname', '/jobsites/[id]', 'params', jsonb_build_object('id', r.jobsite_id))
           else jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', r.lead_id)) end,
      true, (case when r.status = 'expired' then 'qexpd:' else 'qexp:' end) || r.id);
  end loop;

  for r in
    select f.id, f.due_on, f.lead_id, l.company from lead_followups f join leads l on l.id = f.lead_id
     where f.done_at is null and f.due_on <= v_today and l.status not in ('won', 'lost')
  loop
    n := n + notify_permission(array['leads_ver'], 'followup_due', jsonb_build_object('company', r.company, 'day', r.due_on),
      jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', r.lead_id)), true, 'fu:' || r.id || ':' || r.due_on);
  end loop;

  for r in
    select v.id, j.name jobsite, v.local_date from visits v join jobsites j on j.id = v.jobsite_id
     where v.approved_at is null and exists (select 1 from work_entries w where w.visit_id = v.id)
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.clock_out is null)
  loop
    n := n + notify_permission(array['work_aprobar'], 'work_to_approve', jsonb_build_object('jobsite', r.jobsite, 'day', r.local_date),
      jsonb_build_object('pathname', '/schedule/work/[id]', 'params', jsonb_build_object('id', r.id)), true, 'appr:' || r.id);
  end loop;

  for r in
    select j.id, j.name from jobsites j, lateral jobsite_margin_calc(j.id) m
     where j.status = 'active' and m.rate is not null and m.cost > 0 and m.cost >= m.rate
  loop
    n := n + notify_permission(array['clientes_ver_tarifa'], 'margin_alert', jsonb_build_object('jobsite', r.name),
      jsonb_build_object('pathname', '/jobsites/[id]', 'params', jsonb_build_object('id', r.id)), false,
      'margin:' || r.id || ':' || month_start(v_today));
  end loop;

  for r in
    select p.id, p.full_name, wk.sunday, programmed_minutes(p.id, wk.sunday) mins
      from profiles p, (values (v_sunday), (v_sunday + 7)) wk(sunday)
     where p.active and not p.is_super_admin and programmed_minutes(p.id, wk.sunday) >= 28 * 60
  loop
    n := n + notify_permission(array['schedule_ver_editar'], 'hours_32',
      jsonb_build_object('name', r.full_name, 'hours', trim(to_char(round(r.mins / 60.0, 2), 'FM990.99'), '.')),
      jsonb_build_object('pathname', '/schedule'), false, 'h32:' || r.id || ':' || r.sunday);
  end loop;

  if v_today = month_end(v_today) and extract(hour from now() at time zone cc_tz()) >= 8 then
    perform generate_accounting();
    if (select count(*) from income_expected e where e.month = month_start(v_today) and not e.received) > 0 then
      n := n + notify_permission(array['ingresos_marcar_recibidos', 'clientes_ver_tarifa'], 'income_unmarked',
        jsonb_build_object('month', month_start(v_today),
                           'count', (select count(*) from income_expected e where e.month = month_start(v_today) and not e.received)),
        jsonb_build_object('pathname', '/accounting/income',
                           'params', jsonb_build_object('from', to_char(v_today, 'YYYY-MM'), 'to', to_char(v_today, 'YYYY-MM'))),
        false, 'inc:' || month_start(v_today));
    end if;
  end if;
  return n;
end $$;

-- La app -----------------------------------------------------------------------------------------------------------

-- Bandeja (D-084, D-117, D-118): los míos dentro de la app, el más nuevo primero, con el texto en mi idioma.
create function my_notifications(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles;
begin
  select * into me from profiles where auth_user_id = auth.uid() and active;
  if me.id is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'title', (x.t).title, 'detail', (x.t).detail, 'link', x.link,
                                        'created_at', x.created_at, 'read', x.read_at is not null) order by x.created_at desc)
      from (select n.*, notification_text(n.kind, n.data, me.language::text) t from notifications n
             where n.profile_id = me.id and n.in_app order by n.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 200)) x),
    '[]'::jsonb);
end $$;

-- Contador del menú: los no leídos de la bandeja.
create function my_unread_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from notifications where profile_id = current_profile_id() and in_app and read_at is null
$$;

-- Pasa a leída al tocarla (D-117); null las marca todas.
create function mark_notifications_read(p_id uuid default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now()
   where profile_id = current_profile_id() and read_at is null and (p_id is null or id = p_id)
$$;

-- Canales del perfil (D-085, D-215).
create function my_notification_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('push', coalesce(s.push, true), 'email', coalesce(s.email, true), 'in_app', coalesce(s.in_app, true))
    from (select current_profile_id() id) me left join notification_settings s on s.profile_id = me.id
$$;

create function set_my_notification_settings(p_push boolean, p_email boolean, p_in_app boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  insert into notification_settings (profile_id, push, email, in_app, updated_at)
  values (me, coalesce(p_push, true), coalesce(p_email, true), coalesce(p_in_app, true), now())
  on conflict (profile_id) do update set push = excluded.push, email = excluded.email, in_app = excluded.in_app, updated_at = now();
end $$;

-- Correo (solo la Edge Function send-notifications, con la service role) ----------------------------------------------

-- Toma los correos por enviar y los marca "enviando". Inmediatos: todos los pendientes que no van al resumen.
-- Resumen diario (D-215): desde las 8:00 AM de Naples, lo acumulado antes de las 8:00 de hoy, agrupado por persona.
create function claim_notification_emails(p_digest boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz := ((cc_today() + time '08:00') at time zone cc_tz());
  rows jsonb;
begin
  -- Lo que quedó "enviando" más de 30 minutos (la función se cortó) vuelve a pendiente.
  update notifications set email_status = 'pending' where email_status = 'sending' and emailed_at < now() - interval '30 minutes';
  -- Un correo que ya no es noticia no se manda (por ejemplo, si la función estuvo sin desplegar): solo queda en la app.
  update notifications set email_status = 'none'
   where email_status = 'pending' and created_at < now() - case when digest then interval '2 days' else interval '1 day' end;
  if p_digest and now() < cutoff then return '[]'::jsonb; end if;
  with picked as (
    update notifications n set email_status = 'sending', emailed_at = now()
     where n.id in (select id from notifications
                     where email_status = 'pending' and digest = p_digest and (not p_digest or created_at < cutoff)
                     order by created_at limit 200 for update skip locked)
    returning n.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'email', p.email, 'name', p.full_name, 'language', p.language,
                                               'kind', x.kind, 'title', (notification_text(x.kind, x.data, p.language::text)).title,
                                               'detail', (notification_text(x.kind, x.data, p.language::text)).detail,
                                               'created_at', x.created_at) order by p.email, x.created_at), '[]'::jsonb)
    into rows
    from picked x join profiles p on p.id = x.profile_id;
  return rows;
end $$;

create function mark_notification_emails(p_ids uuid[], p_ok boolean) returns void
language sql security definer set search_path = public as $$
  update notifications set email_status = case when p_ok then 'sent' else 'failed' end, emailed_at = now()
   where id = any (p_ids) and email_status = 'sending'
$$;

-- Revisión cada 15 minutos (no envía correos: solo crea avisos).
select cron.schedule('cidclean-avisos', '*/15 * * * *', $$select public.notifications_scan()$$);

-- Permisos de ejecución ---------------------------------------------------------------------------------------------
revoke execute on function cc_short_date(date, text), cc_time(timestamptz), cc_month_name(date, text),
  notification_text(text, jsonb, text), notify_profiles(uuid[], text, jsonb, jsonb, boolean, text), profiles_with(text[]),
  notify_permission(text[], text, jsonb, jsonb, boolean, text), notify_quote_status(), notify_walkthrough_scheduled(),
  notify_visit_staff(), notify_visit_changed(), notify_gps_out(), notify_work_approved(), notify_recurring_generated(),
  notify_permissions_changed(), notify_terms_new(), notifications_scan(), claim_notification_emails(boolean),
  mark_notification_emails(uuid[], boolean) from public, anon, authenticated;
grant execute on function notifications_scan(), claim_notification_emails(boolean), mark_notification_emails(uuid[], boolean) to service_role;
revoke execute on function my_notifications(int), my_unread_count(), mark_notifications_read(uuid), my_notification_settings(),
  set_my_notification_settings(boolean, boolean, boolean) from public, anon;
grant execute on function my_notifications(int), my_unread_count(), mark_notifications_read(uuid), my_notification_settings(),
  set_my_notification_settings(boolean, boolean, boolean) to authenticated;
