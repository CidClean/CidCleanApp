-- Arreglo: next_step_on() (campo calculado de la lista de leads) llama a local_day() y cc_tz(), que authenticated no
-- puede ejecutar; la lista de leads no cargaba. Se vuelve SECURITY DEFINER (solo calcula una fecha con la fila que recibe).
alter function next_step_on(leads) security definer;
alter function next_step_on(leads) set search_path = public;
notify pgrst, 'reload schema';
