-- D-330: "Best regards," antes de la firma en las plantillas sembradas que no tienen despedida propia.
-- Solo si el texto sigue como se sembró (no pisa cambios del dueño).
update email_templates
   set body = replace(body, E'\n\n{firma}', E'\n\nBest regards,\n\n{firma}'), updated_at = now()
 where name in ('Primer contacto', 'Seguimiento')
   and body like E'%\n\n{firma}'
   and body not like '%Best regards%';
