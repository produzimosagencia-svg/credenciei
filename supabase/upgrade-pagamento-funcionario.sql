-- ============================================================
-- UPGRADE: baixa de pagamento do funcionário
--
-- Botão "PAGO" no modal de detalhe — marca/desmarca que o valor a receber
-- do setor já foi pago. Sem workflow de aprovação/adicionais/descontos
-- (isso fica pra uma fase futura) — só um flag simples com data.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table funcionarios add column if not exists pago boolean not null default false;
alter table funcionarios add column if not exists pago_em timestamptz;
