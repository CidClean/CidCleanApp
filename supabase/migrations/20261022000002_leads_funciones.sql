-- Hito 2, Ventas A: funciones de los leads. Corren con los permisos de quien llama (security invoker),
-- así que las reglas por fila de 20261022000001_leads.sql siguen mandando.
-- Fuente: D-072, D-078, D-104, D-111, D-131, D-169; current/flujo.md ("Ventas 1: Lead", "Pendientes del inicio").

-- Agendar el walkthrough de un sitio (D-072, D-078): crea la cita o mueve la que ya estaba agendada,
-- y el lead pasa a Walkthrough agendado si estaba en Nuevo o Contactado (no retrocede).
create function schedule_walkthrough(p_site uuid, p_starts_at timestamptz) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_lead uuid;
  v_id uuid;
begin
  if not has_permission('leads_editar') then
    raise exception 'No tienes permiso para agendar walkthroughs' using errcode = '42501';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'La cita debe ser en el futuro' using errcode = '22023';
  end if;
  select lead_id into v_lead from lead_sites where id = p_site;
  if v_lead is null then
    raise exception 'El sitio no existe' using errcode = 'P0002';
  end if;

  update walkthrough_appointments set starts_at = p_starts_at
   where site_id = p_site and status = 'scheduled'
  returning id into v_id;
  if v_id is null then
    insert into walkthrough_appointments (site_id, starts_at) values (p_site, p_starts_at) returning id into v_id;
  end if;

  update leads set status = 'walkthrough_scheduled' where id = v_lead and status in ('new', 'contacted');
  return v_id;
end $$;

-- Fecha de seguimiento del lead: cierra el seguimiento abierto y, si hay fecha, abre uno nuevo.
-- Con la misma fecha no cambia nada; con null solo lo cierra.
create function set_lead_followup(p_lead uuid, p_due date) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not has_permission('leads_editar') then
    raise exception 'No tienes permiso para editar leads' using errcode = '42501';
  end if;
  if not exists (select 1 from leads where id = p_lead) then
    raise exception 'El lead no existe' using errcode = 'P0002';
  end if;
  if p_due is not null and exists (
    select 1 from lead_followups where lead_id = p_lead and done_at is null and due_on = p_due) then
    return;
  end if;
  update lead_followups set done_at = now() where lead_id = p_lead and done_at is null;
  if p_due is not null then
    insert into lead_followups (lead_id, due_on) values (p_lead, p_due);
  end if;
end $$;

-- Pendientes de Ventas para el Inicio (D-111): seguimientos que vencen hoy o antes y walkthroughs agendados
-- desde hoy, de leads abiertos (ni Ganado ni Perdido). "Hoy" es el día de Naples, Florida.
-- Cada cuenta respeta las reglas por fila: sin leads_ver da 0.
create function home_sales_pending() returns table (followups_due int, walkthroughs_upcoming int)
language sql stable security invoker set search_path = public as $$
  with hoy as (select (now() at time zone 'America/New_York')::date as d)
  select
    (select count(*) from lead_followups f join leads l on l.id = f.lead_id, hoy
      where f.done_at is null and f.due_on <= hoy.d and l.status not in ('won', 'lost'))::int,
    (select count(*) from walkthrough_appointments a
       join lead_sites s on s.id = a.site_id
       join leads l on l.id = s.lead_id, hoy
      where a.status = 'scheduled'
        and a.starts_at >= (hoy.d::timestamp at time zone 'America/New_York')
        and l.status not in ('won', 'lost'))::int
$$;

revoke execute on function schedule_walkthrough(uuid, timestamptz), set_lead_followup(uuid, date), home_sales_pending()
  from public, anon;
grant execute on function schedule_walkthrough(uuid, timestamptz), set_lead_followup(uuid, date), home_sales_pending()
  to authenticated;
