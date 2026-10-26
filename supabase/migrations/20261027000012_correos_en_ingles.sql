-- Orden 32 (D-247, D-250): correos con la marca, siempre en inglés.
-- 1. prepare_send_quote devuelve también el nombre del contacto, para el saludo del correo del quote ("Your quote is
--    ready, {first name}"). El resto es igual a 20261027000005.
-- 2. quote_mail_data (reenviar) devuelve lo que necesita el correo nuevo: contacto, dirección, frecuencia, líneas,
--    total, extra, fecha del servicio y la ruta del PDF, que va adjunto (de la versión y su snapshot).
-- 3. Los correos de los avisos y del resumen salen siempre en inglés (D-247): claim_notification_emails pide
--    notification_text en 'en'. notification_text no se cambia porque la bandeja de la app (my_notifications) lee la
--    misma función con el idioma del perfil, y así la pantalla de Notificaciones sigue en el idioma de cada persona.

CREATE OR REPLACE FUNCTION public.prepare_send_quote(p_version uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v quote_versions;
  q quotes;
  l leads;
  s lead_sites;
  wv walkthrough_versions;
  j jobsites;
  c clients;
  v_to text[];
begin
  if not has_permission('quotes_enviar') then
    raise exception 'No tienes permiso para enviar quotes' using errcode = '42501';
  end if;
  select * into v from quote_versions where id = p_version;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Este quote ya se envió' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(v.lines->'services', '[]'::jsonb)) = 0 then
    raise exception 'El quote necesita al menos un servicio' using errcode = '22023';
  end if;
  -- D-239: el quote de un extra va sin SOW.
  if v.sow_path is null and not exists (select 1 from quotes x where x.id = v.quote_id and x.kind = 'extra') then
    raise exception 'Falta el SOW' using errcode = '22023';
  end if;
  select array_agg(distinct e) into v_to from unnest(array_append(v.recipients, v.contact_email)) e where e is not null;
  if v_to is null or cardinality(v_to) = 0 then
    raise exception 'El quote no tiene a quién enviarse' using errcode = '22023';
  end if;
  select * into q from quotes where id = v.quote_id;
  if q.kind = 'extra' then
    select * into j from jobsites where id = q.jobsite_id;
    select * into c from clients where id = j.client_id;
    return jsonb_build_object(
      'version_id', v.id, 'quote_id', v.quote_id, 'version', quote_version_label(v.minor),
      'language', coalesce((select language from leads where id = c.lead_id), 'en'),
      'company', c.name, 'site', j.name, 'address', j.address, 'frequency', null, 'extra', true, 'service_date', v.service_date,
      'contact_name', nullif(btrim(j.contact_name), ''),
      'lines', v.lines, 'tax_rate', v.tax_rate, 'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total,
      'valid_days', v.valid_days, 'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to));
  end if;
  select * into l from leads where id = q.lead_id;
  select * into s from lead_sites where id = q.site_id;
  select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
  return jsonb_build_object(
    'version_id', v.id, 'quote_id', v.quote_id, 'version', quote_version_label(v.minor), 'language', l.language,
    'company', l.company, 'site', coalesce(nullif(btrim(s.name), ''), s.address),
    'address', coalesce(nullif(btrim(wv.data->'contact'->>'address'), ''), s.address),
    'frequency', wv.data->'frequency', 'extra', false, 'service_date', null, 'lines', v.lines, 'tax_rate', v.tax_rate,
    'contact_name', coalesce(nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(l.contact_name), '')),
    'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total, 'valid_days', v.valid_days,
    'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to));
end $function$;

CREATE OR REPLACE FUNCTION public.quote_mail_data(p_version uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v quote_versions;
  q quotes;
  v_to text[];
  v_contact text;
begin
  if not has_permission('quotes_enviar') then
    raise exception 'No tienes permiso para enviar quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  select * into v from quote_versions where id = p_version;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status not in ('sent', 'viewed') then raise exception 'Este quote no está abierto' using errcode = '22023'; end if;
  select array_agg(distinct e) into v_to from unnest(array_append(v.recipients, v.contact_email)) e where e is not null;
  select * into q from quotes where id = v.quote_id;
  if q.kind = 'extra' then
    select nullif(btrim(contact_name), '') into v_contact from jobsites where id = q.jobsite_id;
  else
    select coalesce(nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(l.contact_name), '')) into v_contact
      from leads l
      left join walkthrough_versions wv on wv.walkthrough_id = q.walkthrough_id and wv.version = v.walkthrough_version
     where l.id = q.lead_id;
  end if;
  return jsonb_build_object('token', v.public_token, 'expires_at', v.expires_at, 'language', v.snapshot->>'language',
    'company', v.snapshot->>'company', 'site', v.snapshot->>'site', 'version', quote_version_label(v.minor),
    'address', v.snapshot->>'address', 'frequency', v.snapshot->'frequency',
    'extra', coalesce((v.snapshot->>'extra')::boolean, false), 'service_date', v.snapshot->>'service_date',
    'contact_name', v_contact, 'lines', v.lines, 'total', v.total, 'pdf_path', v.pdf_path,
    'recipients', to_jsonb(v_to));
end $function$;

create or replace function claim_notification_emails(p_digest boolean) returns jsonb
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
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'email', p.email, 'name', p.full_name, 'language', 'en',
                                               'kind', x.kind, 'title', (notification_text(x.kind, x.data, 'en')).title,
                                               'detail', (notification_text(x.kind, x.data, 'en')).detail,
                                               'created_at', x.created_at) order by p.email, x.created_at), '[]'::jsonb)
    into rows
    from picked x join profiles p on p.id = x.profile_id;
  return rows;
end $$;
