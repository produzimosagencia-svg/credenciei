-- ============================================================
-- UPGRADE: chave PIX do funcionário
--
-- Campo livre (aceita CPF, CNPJ, e-mail, telefone ou chave aleatória),
-- opcional, informado pelo próprio funcionário no formulário público de
-- autocadastro. Usado para facilitar pagamentos/conferências.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table funcionarios add column if not exists chave_pix text;
