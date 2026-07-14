-- ============================================================
-- UPGRADE: valor a receber por funcionário (dentro do setor)
--
-- Cada funcionário pode ter um valor a receber dos demais integrantes do
-- setor (ex: quem organiza a equipe recebe uma comissão dos colegas).
-- Configurável livremente pelo supervisor daquele setor (ou admin/master),
-- por funcionário — independente entre setores, já que cada funcionário
-- pertence a um único fornecedor (setor).
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table funcionarios add column if not exists valor_receber numeric not null default 0;
