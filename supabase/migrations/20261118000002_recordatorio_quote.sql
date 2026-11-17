-- Orden 121: recordatorio automático del quote sin respuesta (D-322 (4), D-323 (5)).
-- A los 3 y a los 7 días del envío de una versión que sigue Enviada o Vista (ni aceptada, ni con cambios pedidos, ni
-- rechazada, ni vencida, ni reemplazada), la Edge Function send-notifications (el cron que ya existe cada 5 minutos)
-- manda un recordatorio desde quotes@mail.cidclean.com solo al contacto del quote, con un enlace NUEVO al portal
-- (el token se guarda como hash, D-316; como el reenvío) y el pie C. Cada recordatorio sale una sola vez: la fila de
-- quote_reminders se crea al reclamarlo, antes de mandar, y no se vuelve a reclamar aunque el envío falle (D-200).
-- Los quotes de un extra (D-238) también lo reciben: D-239 los saca solo del SOW, no del flujo del quote (D-200).

create table quote_reminders (
  version_id uuid not null references quote_versions(id) on delete cascade,
  step       smallint not null check (step in (3, 7)),
  claimed_at timestamptz not null default now(),
  sent_at    timestamptz,
  ok         boolean,
  primary key (version_id, step)
);
alter table quote_reminders enable row level security; -- sin políticas: solo las funciones
revoke all on quote_reminders from public, anon, authenticated;

-- Versiones que califican ahora y el paso que les toca. Si una versión ya pasó los 7 días sin el de 3 (por ejemplo,
-- el cron estuvo apagado), solo sale el de 7 y el de 3 se marca como saltado (sent_at null, ok null) (D-200).
create function quote_reminders_due(p_now timestamptz default now())
returns table(version_id uuid, step smallint)
language sql stable security definer set search_path = public as $$
  select v.id, case when v.sent_at <= p_now - interval '7 days' then 7 else 3 end::smallint
    from quote_versions v
   where v.status in ('sent', 'viewed')
     and v.sent_at is not null
     and v.sent_at >= timestamptz '2026-11-17 00:00:00-05' -- D-200: solo quotes enviados desde que existe el recordatorio
     and v.sent_at <= p_now - interval '3 days'
     and nullif(btrim(coalesce(v.contact_email, '')), '') is not null
     and (v.expires_at is null or v.expires_at > p_now)
     and v.sent_at + interval '30 days' > p_now
     and not exists (select 1 from quote_reminders r where r.version_id = v.id
                      and r.step = case when v.sent_at <= p_now - interval '7 days' then 7 else 3 end)
$$;

-- Reclama los recordatorios que tocan (marca en la base) y da a la función lo justo para el correo: el contacto del
-- quote como único destinatario, el enlace nuevo y los datos de la vista previa. Solo la service role.
create function claim_quote_reminders(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d record;
  v quote_versions;
  info jsonb;
  v_token text;
  out jsonb := '[]'::jsonb;
  n int;
begin
  perform expire_quotes();
  for d in select * from quote_reminders_due(p_now) loop
    insert into quote_reminders (version_id, step) values (d.version_id, d.step) on conflict do nothing;
    get diagnostics n = row_count;
    if n = 0 then continue; end if;
    if d.step = 7 then
      insert into quote_reminders (version_id, step) values (d.version_id, 3) on conflict do nothing; -- saltado
    end if;
    select * into v from quote_versions where id = d.version_id for update;
    info := quote_mail_info(v.id);
    v_token := quote_new_token();
    update quote_versions
       set previous_token_hashes = case when public_token_hash is null then previous_token_hashes
                                        else array_append(previous_token_hashes, public_token_hash) end,
           public_token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
     where id = v.id;
    out := out || jsonb_build_object(
      'version_id', v.id, 'step', d.step, 'to', lower(btrim(v.contact_email)), 'token', v_token,
      'company', info->>'company', 'site', info->>'site', 'address', info->>'address',
      'contact_name', info->>'contact_name', 'version', info->>'version', 'expires_at', info->>'expires_at',
      'extra', info->'extra');
  end loop;
  return out;
end $$;

-- Resultado del envío; si salió, queda en el historial del lead (o del cliente en un extra sin lead).
create function mark_quote_reminder(p_version uuid, p_step smallint, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  v quote_versions;
begin
  update quote_reminders set sent_at = now(), ok = p_ok where version_id = p_version and step = p_step and sent_at is null;
  if not found or not p_ok then return; end if;
  select * into v from quote_versions where id = p_version;
  select * into q from quotes where id = v.quote_id;
  if q.lead_id is not null then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (null, 'quote_recordatorio', 'leads', q.lead_id,
            jsonb_build_object('version', quote_version_label(v.minor), 'kind', p_step::text, 'quote_id', q.id));
  elsif q.jobsite_id is not null then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (null, 'quote_recordatorio', 'clients', (select client_id from jobsites where id = q.jobsite_id),
            jsonb_build_object('version', quote_version_label(v.minor), 'kind', p_step::text, 'quote_id', q.id));
  end if;
end $$;

revoke all on function quote_reminders_due(timestamptz), claim_quote_reminders(timestamptz),
                       mark_quote_reminder(uuid, smallint, boolean) from public, anon, authenticated;
grant execute on function claim_quote_reminders(timestamptz), mark_quote_reminder(uuid, smallint, boolean) to service_role;
