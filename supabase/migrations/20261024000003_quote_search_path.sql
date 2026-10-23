-- Hito 4: search_path fijo también en quote_version_label (aviso function_search_path_mutable de Supabase).
alter function quote_version_label(int) set search_path = public;
