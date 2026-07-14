-- ============================================================
-- UPGRADE: log completo (destinatário + tipo direto na linha)
--
-- mensagens_log já tinha data/hora (criado_em), status e resposta da
-- Evolution API — faltava destinatário e tipo denormalizados na própria
-- linha do log (hoje só dava pra saber via join com mensagens_agendadas).
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table mensagens_log add column if not exists destinatario_telefone text;
alter table mensagens_log add column if not exists tipo text;
