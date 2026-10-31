-- Orden 64 (D-289): lo que leen las pantallas del contrato del cliente. Ficha y línea de pasos del quote aceptado y del
-- jobsite (Aceptado · Contrato enviado · Firmado por el cliente · Firmado por ambas partes), la fecha hasta la que se
-- mantiene el precio (15 días) y el tipo de limpieza. Lo ve quien ve quotes o clientes; preparar, enviar y contrafirmar
-- siguen siendo solo del Super Admin (contract-admin).

create function contract_info(p_jobsite uuid default null, p_site uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j jobsites; c client_contracts; d quote_decisions; v_version uuid;
begin
  if not (is_super_admin() or has_permission('quotes_ver') or has_permission('clientes_ver')) then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;
  perform jobsite_contracts_expire();
  if p_jobsite is not null then select * into j from jobsites where id = p_jobsite;
  else select * into j from jobsites where site_id = p_site; end if;
  if j.id is null then return null; end if;
  select quote_version_id into v_version from jobsite_rates where jobsite_id = j.id;
  select * into d from quote_decisions where version_id = v_version and kind = 'accepted';
  select * into c from client_contracts where jobsite_id = j.id and status <> 'void' order by number desc limit 1;
  return jsonb_build_object(
    'jobsite_id', j.id, 'jobsite', j.name, 'company', (select name from clients where id = j.client_id),
    'status', j.contract_status, 'cleaning_type', j.cleaning_type, 'accepted_at', j.contract_accepted_at,
    'sign_until', j.contract_accepted_at + interval '15 days',
    'accepted_by', d.signer_name, 'accepted_title', d.signer_title,
    'quote_number', (select quote_number_label(q.number) from quote_versions v join quotes q on q.id = v.quote_id where v.id = v_version),
    'quote_version', (select quote_version_label(minor) from quote_versions where id = v_version),
    'can_manage', is_super_admin(),
    'contract', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'csa', contract_label('CSA', c.number), 'status', c.status, 'sent_at', c.sent_at, 'email', c.email,
      'client_signed_at', c.client_signed_at, 'client_signer_name', c.client_signer_name, 'cc_signed_at', c.cc_signed_at,
      'document_id', c.document_id) end);
end $$;

revoke execute on function contract_info(uuid, uuid) from public, anon;
grant execute on function contract_info(uuid, uuid) to authenticated;

-- Schedule (D-289): jobsites activos sin contrato firmado por ambas partes, para el aviso ámbar.
create function schedule_unsigned_jobsites() returns setof uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('schedule_ver_editar') then
    raise exception 'No tienes permiso para ver el schedule' using errcode = '42501';
  end if;
  return query select id from jobsites where status = 'active' and contract_status <> 'both_signed';
end $$;
revoke execute on function schedule_unsigned_jobsites() from public, anon;
grant execute on function schedule_unsigned_jobsites() to authenticated;
