-- Orden 37 (D-251): descripción opcional en cada servicio y add-on del quote. Se guarda en `lines` como
-- "description" (texto de hasta 200 caracteres, D-200) y sale debajo del nombre en el correo, el PDF y el portal.
-- Lo demás de la validación no cambia (D-077, D-209).
create or replace function quote_lines_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  item jsonb;
  sec text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  foreach sec in array array['services', 'addons', 'discounts'] loop
    if jsonb_typeof(coalesce(p->sec, '[]'::jsonb)) <> 'array' then return false; end if;
    if jsonb_array_length(coalesce(p->sec, '[]'::jsonb)) > 50 then return false; end if;
    for item in select * from jsonb_array_elements(coalesce(p->sec, '[]'::jsonb)) loop
      if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'label') <> 'string'
         or btrim(item->>'label') = '' or length(item->>'label') > 120 then return false; end if;
      if sec = 'discounts' then
        if item ? 'description' then return false; end if;
        if coalesce(item->>'kind', '') not in ('amount', 'percent') or jsonb_typeof(item->'value') <> 'number' then return false; end if;
        if (item->>'value')::numeric < 0 or (item->>'kind' = 'percent' and (item->>'value')::numeric > 100)
           or (item->>'value')::numeric > 10000000 then return false; end if;
      else
        if jsonb_typeof(item->'amount') <> 'number' or jsonb_typeof(item->'taxable') <> 'boolean' then return false; end if;
        if (item->>'amount')::numeric < 0 or (item->>'amount')::numeric > 10000000 then return false; end if;
        -- D-251: descripción opcional; si viene, texto (o null) de hasta 200 caracteres.
        if item ? 'description' and jsonb_typeof(item->'description') not in ('string', 'null') then return false; end if;
        if length(coalesce(item->>'description', '')) > 200 then return false; end if;
      end if;
    end loop;
  end loop;
  return true;
end $$;
