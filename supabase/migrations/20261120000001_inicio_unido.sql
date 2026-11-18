-- Órdenes 140 y 142 (D-336, D-337): Inicio unido y Accounts con archivados.
-- (1) home_quote_pending: el nombre ya no sale null. Desde 20261117000001 un lead puede no tener empresa (lead web
--     con solo la persona de contacto), y "Quote accepted: null" salía de l.company vacío. Ahora usa la empresa, si no
--     la persona de contacto, si no el correo del lead, si no el cliente o el jobsite.
-- (2) home_activity: la fila "Actividad" del Inicio, el último hecho relevante con su nombre real (D-200: la última
--     decisión de un cliente sobre un quote: aceptado, rechazado o cambios pedidos). Mismo permiso que los quotes.
-- (3) accounts_overview: datos de la lista de Accounts que no estaban en la tabla de jobsites: cuántas personas están
--     asignadas hoy y la fecha en que terminó un jobsite terminado. Sin cifras; mismo permiso que la lista (clientes_ver).

drop function home_quote_pending();
create function home_quote_pending()
returns table (kind text, version_id uuid, lead_id uuid, jobsite_id uuid, company text, site text, at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not (has_permission('quotes_ver') or has_permission('quotes_editar') or has_permission('quotes_enviar')) then
    return;
  end if;
  perform expire_quotes();
  return query
    select (case when v.decided_at is not null and v.decision_seen_at is null then v.status::text else 'expiring' end),
           v.id, q.lead_id, q.jobsite_id,
           coalesce(nullif(btrim(l.company), ''), nullif(btrim(l.contact_name), ''), nullif(btrim(l.email), ''), c.name, j.name, ''),
           coalesce(nullif(btrim(s.name), ''), s.address, j.name, ''),
           coalesce(v.decided_at, v.expires_at)
      from quote_versions v
      join quotes q on q.id = v.quote_id
      left join leads l on l.id = q.lead_id
      left join lead_sites s on s.id = q.site_id
      left join jobsites j on j.id = q.jobsite_id
      left join clients c on c.id = j.client_id
     where (v.decided_at is not null and v.decision_seen_at is null)
        or (v.status in ('sent', 'viewed') and v.expires_at <= now() + interval '3 days')
     order by coalesce(v.decided_at, v.expires_at) desc;
end $$;

create function home_activity()
returns table (kind text, version_id uuid, lead_id uuid, jobsite_id uuid, name text, site text, at timestamptz, seen boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_permission('quotes_ver') or has_permission('quotes_editar') or has_permission('quotes_enviar')) then
    return;
  end if;
  return query
    select v.status::text, v.id, q.lead_id, q.jobsite_id,
           coalesce(nullif(btrim(l.company), ''), nullif(btrim(l.contact_name), ''), nullif(btrim(l.email), ''), c.name, j.name, ''),
           coalesce(nullif(btrim(s.name), ''), s.address, j.name, ''),
           v.decided_at, v.decision_seen_at is not null
      from quote_versions v
      join quotes q on q.id = v.quote_id
      left join leads l on l.id = q.lead_id
      left join lead_sites s on s.id = q.site_id
      left join jobsites j on j.id = q.jobsite_id
      left join clients c on c.id = j.client_id
     where v.decided_at is not null and v.status in ('accepted', 'rejected', 'changes_requested')
     order by v.decided_at desc
     limit 1;
end $$;

create function accounts_overview()
returns table (jobsite_id uuid, staff_count int, ended_on date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('clientes_ver') then
    raise exception 'No tienes permiso para ver jobsites' using errcode = '42501';
  end if;
  return query
    select j.id,
           (select count(distinct a.profile_id)::int from jobsite_assignments a
             where a.jobsite_id = j.id and a.start_date <= cc_today() and (a.end_date is null or a.end_date >= cc_today())),
           case when j.status = 'terminated' then local_day(j.status_changed_at) end
      from jobsites j;
end $$;

revoke execute on function home_quote_pending(), home_activity(), accounts_overview() from public, anon;
grant execute on function home_quote_pending(), home_activity(), accounts_overview() to authenticated;
