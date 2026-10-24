-- D-240: Accounting empieza en septiembre de 2026 (antes octubre, D-239), para cargar los datos reales de septiembre.
create or replace function accounting_floor() returns date language sql immutable set search_path = public as $$ select date '2026-09-01' $$;
