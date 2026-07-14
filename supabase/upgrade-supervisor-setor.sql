-- ============================================================
-- UPGRADE: supervisores por setor (fornecedor)
--
-- "Setor" reaproveita a tabela `fornecedores` já existente (o cadastro de
-- fornecedor já é usado como setor: "Bar", "Segurança", "Bilheteria"...).
-- Cada supervisor passa a pertencer a EXATAMENTE UM fornecedor (setor) e só
-- enxerga/gerencia a equipe e o scanner daquele setor.
--
-- Rodar no SQL Editor do Supabase (dashboard), DEPOIS de:
--   1) upgrade-papeis-setores-qr.sql
--   2) upgrade-multi-organizacao.sql
--   3) upgrade-rls-lockdown.sql
-- Idempotente.
-- ============================================================

-- 1) Supervisor vinculado a um fornecedor (setor). NULL para os demais papéis.
--    Sem "on delete cascade": um fornecedor com supervisores vinculados não
--    pode ser excluído direto no banco (o app também bloqueia isso antes).
alter table perfis add column if not exists fornecedor_id uuid references fornecedores(id);
create index if not exists perfis_fornecedor_idx on perfis(fornecedor_id);

-- 2) Contato e status do usuário (Ativo/Inativo)
alter table perfis add column if not exists telefone text;
alter table perfis add column if not exists ativo boolean not null default true;

-- 3) supervisor_eventos (vínculo por evento inteiro) fica obsoleto a partir
--    desta mudança — supervisores passam a ser escopados por setor, não mais
--    por evento. A tabela não é apagada (sem perda de dados), só não é mais
--    usada pelo código.
