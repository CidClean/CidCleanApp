-- D-231: toda semana de la app empieza en domingo. El inicio de semana del schedule (límite de 32 h y aviso desde 28 h,
-- D-214; "esta semana y la siguiente" del staff, D-012 y D-093) pasa de lunes a domingo. La función conserva su nombre
-- para no tocar a quienes la usan; devuelve el domingo de la semana del día.
create or replace function week_monday(p date) returns date language sql immutable as $$
  select p - extract(dow from p)::int
$$;
comment on function week_monday(date) is 'Inicio de la semana del día: el domingo (D-231). Antes, el lunes (D-214).';
