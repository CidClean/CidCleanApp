-- Documentos sensibles de los 1099 (D-125): cada apertura queda registrada.
-- Hasta ahora la política employee_docs_select dejaba firmar una URL directo desde Storage sin registrar la apertura.
-- Se quita: ningún usuario autenticado lee employee-docs directo. La única forma de abrir un documento es la
-- Edge Function open-document, que llama a open_profile_document (permiso + registro en el historial) y firma
-- la URL de 60 s con la service role. La política de subir (employee_docs_insert) se queda como está.
drop policy employee_docs_select on storage.objects;
