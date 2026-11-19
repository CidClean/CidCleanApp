-- Orden 152 (D-338 pendiente, D-339, D-340 (3)): "Editar mi perfil" cambia nombre, apellido y teléfono del propio
-- usuario. Solo la fila propia (current_profile_id()) y solo esos tres campos; el correo de entrada no se toca. El
-- teléfono se valida como D-216/D-219/D-246 (10 dígitos de EE. UU., código de área y central de 2 a 9, un 1 inicial se
-- quita, vacío vale) y se guarda como "(239) 555-0142". El nombre completo lo arma el disparador profiles_full_name y
-- el cambio queda en el historial por profiles_log. La firma de las plantillas (D-330) ya lee nombre y teléfono del
-- perfil (template_email_context).

create function update_my_profile(p_first_name text, p_last_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  f text := btrim(coalesce(p_first_name, ''));
  l text := btrim(coalesce(p_last_name, ''));
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if f = '' or l = '' then raise exception 'Faltan el nombre o el apellido' using errcode = '22023'; end if;
  if length(f) > 60 or length(l) > 60 then raise exception 'Nombre muy largo' using errcode = '22023'; end if;
  if length(d) = 11 and left(d, 1) = '1' then d := substr(d, 2); end if;
  if d <> '' and d !~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' then
    raise exception 'Teléfono no válido' using errcode = '22023';
  end if;
  update profiles
     set first_name = f, last_name = l, phone = case when d = '' then null else us_phone_format(d) end
   where id = me;
end $$;

revoke execute on function update_my_profile(text, text, text) from public, anon;
grant execute on function update_my_profile(text, text, text) to authenticated;
