-- Pruebas de las direcciones (migración 20261111000001, orden 76, D-301).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback. Se corren como dueño de la base
-- (prueban funciones y disparadores, no permisos). Uso: psql -f supabase/tests/direcciones.sql
-- (la última consulta lista cada prueba con ok = true/false, y antes la simulación de cuántas quedan para revisar).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);

create function pg_temp.es(prueba text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle)
  values (prueba, esperado is not distinct from obtenido, 'esperado=' || coalesce(esperado, '∅') || ' obtenido=' || coalesce(obtenido, '∅'))
$$;

create function pg_temp.p(t text) returns text language sql as $$
  select concat_ws('|', coalesce(r.line1, '∅'), coalesce(r.line2, '∅'), coalesce(r.city, '∅'), coalesce(r.state, '∅'),
                   coalesce(r.zip, '∅'), r.ok::text)
    from parse_us_address(t) r
$$;

-- Separar texto libre --------------------------------------------------------------------------------------------
select pg_temp.es('completa con Suite en la calle', '1250 Pine Ridge Rd|Suite 202|Naples|FL|34108|true',
                  pg_temp.p('1250 Pine Ridge Rd Suite 202, Naples, FL 34108'));
select pg_temp.es('completa con Dirección 2 separada por coma', '1520 Golden Gate Pkwy|Apt 4|Naples|FL|34105|true',
                  pg_temp.p('1520 Golden Gate Pkwy, Apt 4, Naples, FL 34105'));
select pg_temp.es('completa sin coma entre ciudad y estado, ZIP+4 y USA', '10 Palm Ave|∅|Naples|FL|34102-1234|true',
                  pg_temp.p('10 Palm Ave,  Naples FL 34102-1234, USA'));
select pg_temp.es('estado en minúsculas o escrito Florida', '9 Bay St|∅|Marco Island|FL|34145|true',
                  pg_temp.p('9 Bay St, Marco Island, Florida 34145'));
select pg_temp.es('sin ZIP: todo en Dirección', '100 Main St, Naples, FL|∅|∅|∅|∅|false', pg_temp.p('100 Main St, Naples, FL'));
select pg_temp.es('sin ciudad: todo en Dirección', '20 Bay St FL 34102|∅|∅|∅|∅|false', pg_temp.p('20 Bay St FL 34102'));
select pg_temp.es('estado que no existe: todo en Dirección', '1 Main St, Naples, XX 34102|∅|∅|∅|∅|false',
                  pg_temp.p('1 Main St, Naples, XX 34102'));
select pg_temp.es('texto raro', 'Frente al Publix, local 3 (preguntar por Ana)|∅|∅|∅|∅|false',
                  pg_temp.p('  Frente al Publix,   local 3 (preguntar por Ana) '));
select pg_temp.es('solo calle', '10 Main St|∅|∅|∅|∅|false', pg_temp.p('10 Main St'));
select pg_temp.es('vacío', '∅|∅|∅|∅|∅|false', pg_temp.p('   '));

-- Una línea ------------------------------------------------------------------------------------------------------
select pg_temp.es('format_address completa', '1250 Pine Ridge Rd, Suite 202, Naples, FL 34108',
                  format_address('1250 Pine Ridge Rd', 'Suite 202', 'Naples', 'FL', '34108'));
select pg_temp.es('format_address sin Dirección 2 ni ZIP', '10 Main St, Naples, FL',
                  format_address(' 10 Main St ', '', 'Naples', 'FL', null));
select pg_temp.es('format_address vacía es null', null, format_address('', null, ' ', null, ''));
select pg_temp.es('vuelta completa: separar la línea armada da las mismas partes',
                  '1520 Golden Gate Pkwy|Apt 4|Naples|FL|34105|true',
                  pg_temp.p(format_address('1520 Golden Gate Pkwy', 'Apt 4', 'Naples', 'FL', '34105')));

-- Validaciones comunes -------------------------------------------------------------------------------------------
select pg_temp.es('estados: 50 + DC', '51', array_length(us_state_codes(), 1)::text);
select pg_temp.es('ZIP 5 y 5+4 válidos, otros no', 't|t|f|f',
                  concat_ws('|', is_us_zip('34108'), is_us_zip('34108-1234'), is_us_zip('3410'), is_us_zip('34108 1234')));

-- Disparador en las tablas ---------------------------------------------------------------------------------------
insert into leads (id, company) values ('00000000-0000-0000-0000-0000000000a1', 'Prueba direcciones');

-- Sitio con partes: la línea se arma sola.
insert into lead_sites (id, lead_id, address_line1, address_line2, city, state, zip)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
        '1250 Pine Ridge Rd', 'Suite 202', 'Naples', 'fl', '34108');
select pg_temp.es('sitio con partes arma address y no queda para revisar', '1250 Pine Ridge Rd, Suite 202, Naples, FL 34108|false',
                  (select address || '|' || address_needs_review from lead_sites where id = '00000000-0000-0000-0000-0000000000b1'));

-- Sitio escrito solo como texto (app sin actualizar): se separa.
insert into lead_sites (id, lead_id, address)
values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', '20 Bay St, Naples, FL 34102');
select pg_temp.es('sitio con texto completo se separa', '20 Bay St|Naples|FL|34102|f',
                  (select concat_ws('|', address_line1, city, state, zip, address_needs_review) from lead_sites
                    where id = '00000000-0000-0000-0000-0000000000b2'));

insert into lead_sites (id, lead_id, address)
values ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', '200 Main St, Naples');
select pg_temp.es('sitio sin estado ni ZIP queda en Dirección y para revisar', '200 Main St, Naples|200 Main St, Naples|t',
                  (select concat_ws('|', address, address_line1, address_needs_review) from lead_sites
                    where id = '00000000-0000-0000-0000-0000000000b3'));

-- Completar la dirección desde la app quita la marca.
update lead_sites set address_line1 = '200 Main St', city = 'Naples', state = 'FL', zip = '34102'
 where id = '00000000-0000-0000-0000-0000000000b3';
select pg_temp.es('al completar las partes se quita la marca', '200 Main St, Naples, FL 34102|false',
                  (select address || '|' || address_needs_review from lead_sites where id = '00000000-0000-0000-0000-0000000000b3'));

-- State FL por defecto sin calle no se guarda.
insert into clients (id, name, state) values ('00000000-0000-0000-0000-0000000000c1', 'Cliente prueba', 'FL');
select pg_temp.es('cliente sin calle: sin dirección ni State', '∅|∅|f',
                  (select concat_ws('|', coalesce(address, '∅'), coalesce(state, '∅'), address_needs_review) from clients
                    where id = '00000000-0000-0000-0000-0000000000c1'));

-- State y ZIP con las mismas reglas que el perfil.
do $$ begin
  begin
    update clients set address_line1 = '1 A St', state = 'XX' where id = '00000000-0000-0000-0000-0000000000c1';
    perform pg_temp.es('State fuera de la lista se rechaza', 'ERR:23514', 'ok');
  exception when check_violation then perform pg_temp.es('State fuera de la lista se rechaza', 'ERR:23514', 'ERR:23514');
  end;
  begin
    update clients set address_line1 = '1 A St', zip = '3410' where id = '00000000-0000-0000-0000-0000000000c1';
    perform pg_temp.es('ZIP no válido se rechaza', 'ERR:23514', 'ok');
  exception when check_violation then perform pg_temp.es('ZIP no válido se rechaza', 'ERR:23514', 'ERR:23514');
  end;
end $$;

-- Jobsite nacido del sitio: copia las partes del sitio (no las vuelve a adivinar).
insert into jobsites (id, client_id, site_id, name, address)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1',
        'Sitio', '1250 Pine Ridge Rd, Suite 202, Naples, FL 34108');
select pg_temp.es('jobsite desde el sitio copia sus partes', '1250 Pine Ridge Rd|Suite 202|Naples|FL|34108|f',
                  (select concat_ws('|', address_line1, address_line2, city, state, zip, address_needs_review) from jobsites
                    where id = '00000000-0000-0000-0000-0000000000d1'));

-- Jobsite con una dirección que no se reconoce.
insert into jobsites (id, client_id, name, address)
values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'Raro', 'Bodega 4, zona industrial');
select pg_temp.es('jobsite con texto raro queda para revisar sin perder el texto', 'Bodega 4, zona industrial|true',
                  (select address || '|' || address_needs_review from jobsites where id = '00000000-0000-0000-0000-0000000000d2'));

-- p_data de la app con partes: la línea sale de las partes.
select pg_temp.es('jobsite_address_data arma address desde las partes', '30 Gulf St, Naples, FL 34102',
                  jobsite_address_data('{"name":"X","address":"viejo","address_line1":"30 Gulf St","address_line2":"","city":"Naples","state":"FL","zip":"34102"}')->>'address');
select pg_temp.es('jobsite_address_data sin partes deja el texto', 'viejo', jobsite_address_data('{"address":"viejo"}')->>'address');

-- Simulación de la migración con los formatos que hay en el repositorio (pruebas, muestras y datos de ejemplo).
create temp table muestras (t text);
insert into muestras values ('10 Main St'), ('10 Main St, Naples, FL 34102'), ('100 Main St, Naples'), ('1520 Golden Gate Pkwy'),
  ('20 Bay St, Naples, FL 34102'), ('200 Main St, Naples'), ('123 5th Ave S'), ('123 5th Ave S, Naples'),
  ('123 5th Ave S, Naples, FL 34102'), ('1520 Golden Gate Pkwy, Apt 4'), ('10 Palm Ave, Naples, FL 34102'),
  ('900 Marco Island Blvd'), ('30 Gulf St'), ('9 Bay St'), ('3727 Milano Lakes Cir, Naples FL 34114'),
  ('1250 Pine Ridge Rd Suite 202, Naples, FL 34108');
select count(*) filter (where not (parse_us_address(t)).ok) para_revisar, count(*) total from muestras;

select n, prueba, ok, detalle from resultados order by n;
rollback;
