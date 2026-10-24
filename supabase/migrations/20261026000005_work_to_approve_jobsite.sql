-- D-235: Schedule & Work dentro de cada jobsite. "Por aprobar" devuelve también el id del jobsite para poder
-- filtrar a ese jobsite. El resto de la función no cambia.
create or replace function public.work_to_approve()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not (has_permission('work_aprobar') or has_permission('work_editar') or has_permission('work_revisar_gps')) then
    raise exception 'No tienes permiso para ver el trabajo por aprobar' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'jobsite_id', v.jobsite_id, 'jobsite', j.name, 'day', v.local_date, 'starts_at', v.starts_at,
      'people', (select count(*) from work_entries w where w.visit_id = v.id),
      'minutes', (select coalesce(sum(round(extract(epoch from (w.clock_out - w.clock_in)) / 60)), 0)::int
                    from work_entries w where w.visit_id = v.id and w.clock_out is not null),
      'open', exists (select 1 from work_entries w where w.visit_id = v.id and w.clock_out is null),
      'gps_out', exists (select 1 from work_entries w where w.visit_id = v.id and work_gps_pending(w)),
      'review', exists (select 1 from work_entries w where w.visit_id = v.id and work_needs_review(w)),
      -- Urgente (D-131): más de 1 día esperando.
      'urgent', v.local_date < cc_today() - 1)
      order by v.starts_at)
      from visits v join jobsites j on j.id = v.jobsite_id
     where v.approved_at is null and exists (select 1 from work_entries w where w.visit_id = v.id)), '[]'::jsonb);
end $function$;
