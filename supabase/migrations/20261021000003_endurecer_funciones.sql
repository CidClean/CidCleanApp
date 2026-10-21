-- Endurecer funciones tras los avisos de seguridad de Supabase (2026-10-21).
alter function touch_updated_at()       set search_path = public;
alter function change_log_append_only() set search_path = public;

-- Las funciones de apoyo solo las usan las reglas por fila de quien ya entró.
revoke execute on function current_profile_id(), has_permission(text), is_super_admin() from public, anon;
grant  execute on function current_profile_id(), has_permission(text), is_super_admin() to authenticated;

-- Los disparadores no se llaman desde la API.
revoke execute on function link_auth_user(), log_profile_change(), log_permission_change() from public, anon, authenticated;
