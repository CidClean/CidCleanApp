-- Orden 40 (D-254, D-113, D-114, D-130): papelera de Ajustes → Categorías de gastos.
-- remove_expense_category corría con los permisos de quien llama, pero `authenticated` no puede leer `expenses` ni
-- `recurring_expenses` (se leen solo por funciones), así que al Super Admin le daba "permission denied for table expenses".
-- Ahora corre con los permisos del dueño de la función; sigue revisando primero que quien llama sea el Super Admin.
-- La ejecución ya estaba dada a `authenticated` (20261027000001); se vuelve a dejar explícita.
create or replace function remove_expense_category(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin edita las categorías' using errcode = '42501';
  end if;
  if not exists (select 1 from expense_categories where id = p_id) then
    raise exception 'La categoría no existe' using errcode = 'P0002';
  end if;
  if exists (select 1 from expenses where category_id = p_id) or exists (select 1 from recurring_expenses where category_id = p_id) then
    update expense_categories set active = false where id = p_id;
    return 'deactivated';
  end if;
  delete from expense_categories where id = p_id;
  return 'deleted';
end $$;
revoke execute on function remove_expense_category(uuid) from public, anon;
grant execute on function remove_expense_category(uuid) to authenticated;
