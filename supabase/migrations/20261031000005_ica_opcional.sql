-- Orden 69 (D-292, reemplaza en parte D-285): el ICA queda disponible pero es opcional y NO bloquea nada. Sin ICA ni
-- W-9 firmado se puede asignar, programar, ofrecer y registrar días. Se quita por completo la regla de
-- 20261031000002 (disparadores, ica_can_work/ica_check y el estado "ICA pendiente (anterior a la app)"): sin ICA el
-- estado es 'none' y la app muestra la ficha neutra "Sin ICA" (acuerdo verbal). Las migraciones anteriores no se tocan.

drop trigger if exists jobsite_assignments_ica on jobsite_assignments;
drop trigger if exists visit_staff_ica on visit_staff;
drop trigger if exists service_days_ica on service_days;
drop function if exists jobsite_assignments_ica();
drop function if exists visit_staff_ica();
drop function if exists service_days_ica();

-- Ofrecer trabajo ya no pide el ICA.
do $$
declare
  src text;
begin
  select pg_get_functiondef('create_job_offer(uuid, uuid, uuid, numeric, date, text)'::regprocedure) into src;
  src := replace(src, '  perform ica_check(p.id, j.id);' || chr(10), '');
  if src like '%ica_check%' then raise exception 'create_job_offer no se pudo actualizar'; end if;
  execute src;
end $$;

drop function if exists ica_check(uuid, uuid);
drop function if exists ica_can_work(uuid, uuid);

-- Estado para las pantallas: none (Sin ICA), draft, sent, contractor_signed, signed; not_required para los W-2.
create or replace function ica_info(p_profile uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p profiles; c contractor_agreements;
begin
  if not (is_super_admin() or has_permission('empleados_ver') or current_profile_id() = p_profile) then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;
  select * into p from profiles where id = p_profile;
  if p.id is null then return null; end if;
  select * into c from contractor_agreements where profile_id = p.id and status <> 'void' order by number desc limit 1;
  return jsonb_build_object(
    'profile_id', p.id, 'name', p.full_name, 'worker_type', p.worker_type,
    'state', case when p.worker_type is distinct from '1099' then 'not_required' when c.id is null then 'none' else c.status end,
    'w9_signed', w9_is_signed(p.id), 'can_manage', is_super_admin(),
    'agreement', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'ica', contract_label('ICA', c.number), 'status', c.status, 'source', c.source, 'email', c.email,
      'sent_at', c.sent_at, 'expires_at', c.expires_at, 'contractor_signed_at', c.contractor_signed_at,
      'contractor_signer_name', c.contractor_signer_name, 'cc_signed_at', c.cc_signed_at, 'uploaded_at', c.uploaded_at,
      'uploaded_by', (select full_name from profiles where id = c.uploaded_by)) end);
end $$;

-- El estado "anterior a la app" ya no existe.
insert into change_log (actor_id, action, entity, entity_id, detail)
select null, 'ica_opcional', 'profiles', null, jsonb_build_object('quitados', count(*)) from contractor_ica_legacy;
drop table contractor_ica_legacy;
