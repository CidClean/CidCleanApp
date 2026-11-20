-- Orden 160 (D-347, D-348): orígenes nuevos del lead, anuncios ('ads') y agentes de IA ('agent').
-- Va sola en su archivo: un valor nuevo de un enum no se puede usar en la misma transacción en que se agrega.
-- 'campaign' se queda en el tipo (Postgres no quita valores); los leads que ya lo tienen no cambian.
alter type lead_source add value if not exists 'ads';
alter type lead_source add value if not exists 'agent';
