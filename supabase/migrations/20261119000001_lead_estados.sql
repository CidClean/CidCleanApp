-- Orden 130 (D-332, D-333): estados nuevos del lead para el flujo automático.
-- Va sola en su archivo: un valor nuevo de un enum no se puede usar en la misma transacción en que se agrega.
-- 'contacted' se queda en el tipo (Postgres no quita valores), pero la migración siguiente lo deja sin uso.
alter type lead_status add value if not exists 'waiting' before 'walkthrough_scheduled';
alter type lead_status add value if not exists 'follow_up' before 'walkthrough_scheduled';
alter type lead_status add value if not exists 'follow_up_2' before 'walkthrough_scheduled';
alter type lead_status add value if not exists 'no_response' before 'walkthrough_scheduled';
alter type lead_status add value if not exists 'interested' before 'walkthrough_scheduled';
