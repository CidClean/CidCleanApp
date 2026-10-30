-- Conversión de los registros de 1099 a días de servicio (D-277 (1), respuesta del dueño "Conservar como días").
-- La aplica el arquitecto, después de 20261030000006_dias_servicio.sql.
-- Cada registro de horas de un 1099: visita aprobada → día aprobado con su pay_amount; sin aprobar → día pendiente.
-- Después se borran esas filas (horas, ubicación y distancias). Al final se verifica que quedan 0 filas de 1099.

insert into service_days (visit_id, profile_id, status, unscheduled, marked_by, marked_at, reviewed_by, reviewed_at, amount, created_at)
select w.visit_id, w.profile_id,
       case when v.approved_at is not null then 'approved' else 'pending' end,
       w.unscheduled,
       coalesce(w.recorded_by, case when w.in_status <> 'auto' then w.profile_id end),
       w.created_at,
       v.approved_by, v.approved_at,
       case when v.approved_at is not null then coalesce(w.pay_amount, 0) end,
       w.created_at
  from work_entries w join visits v on v.id = w.visit_id join profiles p on p.id = w.profile_id
 where p.worker_type = '1099'
on conflict (visit_id, profile_id) do nothing;

insert into change_log (actor_id, action, entity, entity_id, detail)
select null, 'horas_1099_convertidas', 'profiles', null,
       jsonb_build_object('registros', count(*), 'aprobados', count(*) filter (where v.approved_at is not null))
  from work_entries w join visits v on v.id = w.visit_id join profiles p on p.id = w.profile_id
 where p.worker_type = '1099';

delete from work_entries w using profiles p where p.id = w.profile_id and p.worker_type = '1099';

do $$
begin
  if (select count(*) from work_entries w join profiles p on p.id = w.profile_id where p.worker_type = '1099') > 0 then
    raise exception 'Quedan registros de horas/GPS de 1099';
  end if;
end $$;

-- Verificación (debe dar 0):
select count(*) as filas_horas_gps_1099
  from work_entries w join profiles p on p.id = w.profile_id where p.worker_type = '1099';
