-- ============================================================
-- UPGRADE: campo "valor combinado por funcionário" no fornecedor
--
-- Cadastro do fornecedor passa a ser:
--   - Nome da empresa / Setor        (fornecedores.nome)
--   - Quantidade de funcionários     (fornecedores.quantidade_estimada)
--   - Valor combinado por funcionário (fornecedores.valor_combinado) — NOVO
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table fornecedores add column if not exists valor_combinado numeric;
