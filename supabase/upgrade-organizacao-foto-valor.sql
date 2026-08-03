-- ============================================================
-- UPGRADE: foto de perfil e valor cobrado por organização
--
-- - foto_perfil_path: caminho no bucket privado `presencas` (mesmo bucket
--   já usado pras fotos de presença e avatar de funcionário), prefixo
--   `organizacoes/` — assinada sob demanda, igual o resto do sistema.
-- - valor_cobrado: valor mensal/recorrente cobrado do cliente. Puramente
--   informativo por enquanto (dashboards financeiros ficam pra depois).
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table organizacoes add column if not exists foto_perfil_path text;
alter table organizacoes add column if not exists valor_cobrado numeric;
