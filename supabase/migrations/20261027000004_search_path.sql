-- Hito 7: search_path fijo en las funciones nuevas de Accounting y avisos (aviso function_search_path_mutable de
-- Supabase), como 20261024000003 con quote_version_label. No cambia lo que hacen.
alter function month_start(date) set search_path = public;
alter function month_end(date) set search_path = public;
alter function month_day(date, int) set search_path = public;
alter function accounting_floor() set search_path = public;
alter function accounting_range_valid(date, date) set search_path = public;
alter function income_due_day(date, date) set search_path = public;
alter function cc_short_date(date, text) set search_path = public;
alter function cc_month_name(date, text) set search_path = public;
