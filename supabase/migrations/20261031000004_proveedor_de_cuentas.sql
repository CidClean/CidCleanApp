-- Orden 68 (D-291): clientes que son proveedores de cuentas. Un cliente marcado como "Proveedor de cuentas" maneja sus
-- jobsites directo: nacen "Firmado por ambas partes" para el contrato (sin quote, contrato de cliente ni portal) y se
-- dan de alta a mano como los de un cliente previo a la app (create_legacy_jobsite), con la tarifa que paga el
-- proveedor. Si se marca un cliente existente, sus jobsites pasan a firmados (y un contrato sin firmar queda anulado).
-- Lo marca o desmarca el Super Admin o quien edita clientes; queda en el historial. "Wilson Franquicia" queda marcado.

alter table clients add column account_provider boolean not null default false;

-- Jobsite nuevo de un cliente previo a la app (D-210) o de un proveedor de cuentas (D-291): nace firmado.
create or replace function jobsites_contract_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from clients where id = new.client_id and (legacy or account_provider)) then
    new.contract_status := 'both_signed';
  end if;
  return new;
end $$;

-- Pasa a firmados los jobsites de un cliente proveedor (los terminados no se tocan).
create function client_provider_sign_jobsites(p_client uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update client_contracts set status = 'void', token_hash = null
   where status in ('draft', 'sent', 'client_signed')
     and jobsite_id in (select id from jobsites where client_id = p_client and contract_status <> 'both_signed');
  update jobsites set contract_status = 'both_signed', contract_signed_at = coalesce(contract_signed_at, now())
   where client_id = p_client and status <> 'terminated' and contract_status <> 'both_signed';
  get diagnostics n = row_count;
  return n;
end $$;

create function set_client_account_provider(p_client uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  c clients; n int := 0;
begin
  if not has_permission('clientes_editar_datos') then
    raise exception 'No tienes permiso para editar clientes' using errcode = '42501';
  end if;
  if p_value is null then raise exception 'Valor no válido' using errcode = '22023'; end if;
  select * into c from clients where id = p_client for update;
  if c.id is null then raise exception 'El cliente no existe' using errcode = 'P0002'; end if;
  if c.account_provider = p_value then return; end if;
  update clients set account_provider = p_value where id = c.id;
  if p_value then n := client_provider_sign_jobsites(c.id); end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), case when p_value then 'cliente_proveedor_marcado' else 'cliente_proveedor_desmarcado' end,
          'clients', c.id, jsonb_build_object('company', c.name, 'jobsites_firmados', n));
end $$;

-- Alta a mano de jobsites: también en los clientes proveedores (sin quote).
do $$
declare
  src text;
begin
  select pg_get_functiondef('create_legacy_jobsite'::regproc) into src;
  src := replace(src, 'where id = p_client and legacy)', 'where id = p_client and (legacy or account_provider))');
  src := replace(src, '''legacy'', true));', '''legacy'', (select legacy from clients where id = p_client),
                             ''account_provider'', (select account_provider from clients where id = p_client)));');
  if src not like '%legacy or account_provider%' or src not like '%''account_provider'', (select%' then
    raise exception 'create_legacy_jobsite no se pudo actualizar';
  end if;
  execute src;
end $$;

-- "Wilson Franquicia" (D-291).
do $$
declare
  c clients; n int;
begin
  for c in select * from clients where name = 'Wilson Franquicia' and not account_provider loop
    update clients set account_provider = true where id = c.id;
    n := client_provider_sign_jobsites(c.id);
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (null, 'cliente_proveedor_marcado', 'clients', c.id, jsonb_build_object('company', c.name, 'jobsites_firmados', n));
  end loop;
end $$;

revoke execute on function client_provider_sign_jobsites(uuid), set_client_account_provider(uuid, boolean) from public, anon, authenticated;
grant execute on function set_client_account_provider(uuid, boolean) to authenticated;
