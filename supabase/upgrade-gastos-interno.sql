-- ════════════════════════════════════════════════════════════════════════════
-- Gastos — lançamento "Interno" (sem evento) + pagador
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Duas coisas:
--
-- 1) NEM TODO GASTO É DE UM EVENTO. O Juan pediu (15/09/2026): às vezes o
--    que se paga não é pro evento em si (ex.: assinatura de ferramenta,
--    despesa de escritório). `evento_id` vira opcional — quando o gasto é
--    "Interno", ele fica null e `organizacao_id` (novo, preenchido sempre
--    que o evento for null) segura o escopo de quem pode ver o quê. Um
--    evento normal continua sem `organizacao_id` preenchido — ele já
--    carrega a organização por tabela (`eventos.organizacao_id`), guardar
--    duas vezes só arriscaria os dois ficarem dessincronizados.
--
-- 2) PAGADOR — texto livre, quem adiantou o dinheiro do próprio bolso (pra
--    saber quem reembolsar depois). Mesma lógica de `fornecedor` e
--    `forma_pagamento`: sem lista fechada, sem tabela de pessoas.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table gastos_evento alter column evento_id drop not null;
alter table gastos_evento add column if not exists organizacao_id uuid references organizacoes(id) on delete cascade;
alter table gastos_evento add column if not exists pagador text;

create index if not exists gastos_evento_por_organizacao on gastos_evento (organizacao_id);

commit;

-- ROLLBACK
--   begin;
--     drop index if exists gastos_evento_por_organizacao;
--     alter table gastos_evento drop column if exists pagador;
--     alter table gastos_evento drop column if exists organizacao_id;
--     -- só recoloca o NOT NULL se não houver nenhum gasto Interno gravado:
--     -- update gastos_evento set evento_id = '<algum evento>' where evento_id is null;
--     alter table gastos_evento alter column evento_id set not null;
--   commit;
