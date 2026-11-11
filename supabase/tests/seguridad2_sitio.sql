-- Pruebas de la segunda revisión de seguridad del sitio (órdenes 100 y 101; N1 y N2; migraciones 20261114000001 y 0002).
-- Repetibles: todo termina en rollback. Uso (desde la raíz del repositorio): psql -f supabase/tests/seguridad2_sitio.sql
-- (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
grant all on resultados, actores to public;

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;
create function pg_temp.envio(correo text, ip text, nombre text default 'Ana Prueba', kind text default 'estimate',
                              mensaje text default null) returns jsonb language sql as $$
  select site_submit(kind, nombre, '', correo, '(239) 555-0101', 'Naples', '34102', 'office', 3000, 'weekly_3', mensaje, ip)
$$;
create function pg_temp.valor(quien text, consulta text) returns text language plpgsql as $$
declare
  resultado text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select auth_id from actores where nombre = quien),
                     'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate;
  end;
  reset role;
  return resultado;
end $$;

-- Sin envíos previos que muevan los conteos.
delete from site_submissions;

-- 2. Correo normalizado -------------------------------------------------------------------------------------------------
select pg_temp.prueba('clave: minúsculas y sin +etiqueta', 'victima@example.com', site_email_key(' Victima+1@Example.com '));
select pg_temp.prueba('clave: gmail sin puntos ni +etiqueta', 'victima@gmail.com', site_email_key('Vic.Ti.Ma+x@gmail.com'));
select pg_temp.prueba('clave: googlemail igual que gmail', 'victima@gmail.com', site_email_key('v.ictima@googlemail.com'));
select pg_temp.prueba('clave: otros dominios conservan los puntos', 'a.b@example.com', site_email_key('a.b+z@example.com'));
select pg_temp.prueba('alias 1 pasa', 'ok', pg_temp.envio('vic.tima+1@gmail.com', 'ipA')->>'status');
select pg_temp.prueba('alias 2 pasa', 'ok', pg_temp.envio('victima+2@gmail.com', 'ipB')->>'status');
select pg_temp.prueba('alias 3 pasa', 'ok', pg_temp.envio('v.i.c.t.i.m.a@googlemail.com', 'ipC')->>'status');
select pg_temp.prueba('4.º alias del mismo buzón: rate_limited', 'rate_limited', pg_temp.envio('victima+4@gmail.com', 'ipD')->>'status');

-- 1. Sin IP: balde común con tope 5 por hora --------------------------------------------------------------------------
select pg_temp.prueba('sin IP 1..5 pasan', '5',
  (select count(*)::text from generate_series(1, 5) i where pg_temp.envio('sinip' || i || '@ex.com', null)->>'status' = 'ok'));
select pg_temp.prueba('6.º sin IP: rate_limited (ya no se salta el límite)', 'rate_limited', pg_temp.envio('sinip6@ex.com', null)->>'status');
select pg_temp.prueba('con IP sigue pasando', 'ok', pg_temp.envio('conip@ex.com', 'ipE')->>'status');
update site_submissions set created_at = now() - interval '2 hours' where ip_hash is null;
select pg_temp.prueba('sin IP: lo de hace más de 1 h no cuenta', 'ok', pg_temp.envio('sinip7@ex.com', null)->>'status');

-- Por IP (o /64, que llega como el mismo hash): 5 por hora.
select pg_temp.prueba('misma IP 1..5 pasan', '5',
  (select count(*)::text from generate_series(1, 5) i where pg_temp.envio('ip' || i || '@ex.com', 'ip64')->>'status' = 'ok'));
select pg_temp.prueba('6.º de la misma IP: rate_limited', 'rate_limited', pg_temp.envio('ip6@ex.com', 'ip64')->>'status');

-- 4. Tope global de correos al cliente ---------------------------------------------------------------------------------
delete from site_submissions;
select pg_temp.prueba('con cupo: send_customer_mail = true', 'true', pg_temp.envio('cupo@ex.com', 'g0')->>'send_customer_mail');
select pg_temp.prueba('contacto nunca manda correo al cliente', 'false',
  pg_temp.envio('contacto@ex.com', 'g0', 'Ana', 'contact', 'Please call me about cleaning.')->>'send_customer_mail');
insert into site_submissions (kind, ip_hash, email, email_key, customer_mail)
select 'estimate', 'g' || i, 'g' || i || '@ex.com', 'g' || i || '@ex.com', true from generate_series(1, 39) i;
select pg_temp.prueba('40 correos en la hora: el siguiente no lleva correo', 'false',
  (select r->>'send_customer_mail' from pg_temp.envio('tope@ex.com', 'gX') r));
select pg_temp.prueba('pasado el tope el lead se crea igual', 'true',
  (select r->>'new_lead' from pg_temp.envio('tope2@ex.com', 'gY') r));
select pg_temp.prueba('el lead lo anota en sus notas', 'true',
  (select (notes like '%Estimate email to the customer not sent: hourly limit reached.%')::text from leads where email = 'tope2@ex.com'));
select pg_temp.prueba('el envío queda sin correo al cliente', 'false',
  (select customer_mail::text from site_submissions where email = 'tope2@ex.com'));
update site_submissions set created_at = now() - interval '61 minutes' where customer_mail;
select pg_temp.prueba('pasada la hora vuelve a haber cupo', 'true', pg_temp.envio('cupo2@ex.com', 'gZ')->>'send_customer_mail');

-- 5. Nombre recortado a 60 ----------------------------------------------------------------------------------------------
select pg_temp.prueba('nombre de 100 caracteres: ok', 'ok', pg_temp.envio('largo@ex.com', 'n1', repeat('N', 100))->>'status');
select pg_temp.prueba('nombre recortado a 60', '60', (select length(contact_name)::text from leads where email = 'largo@ex.com'));

-- 6. Atómico: el bloqueo de transacción queda tomado hasta el fin de la transacción ------------------------------------
select pg_temp.prueba('site_submit toma el bloqueo de transacción', 'true',
  (select exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()
                   and objid = hashtext('site_submit')::oid)::text));

-- Permisos: la clave del correo no la ejecuta la API.
select pg_temp.prueba('anon no ejecuta site_email_key', 'false', has_function_privilege('anon', 'site_email_key(text)', 'execute')::text);
select pg_temp.prueba('authenticated no ejecuta site_email_key', 'false',
  has_function_privilege('authenticated', 'site_email_key(text)', 'execute')::text);

select n, prueba, ok, detalle from resultados order by n;
rollback;
