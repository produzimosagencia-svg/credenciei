-- ════════════════════════════════════════════════════════════════════════════
-- Produtor — acesso próprio pro módulo GASTOS, comercializável à parte
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Uma tabela nova + uma coluna em `gastos_evento`.
--
-- POR QUE
--
-- Gastos deixa de ser função de quem opera o credenciamento e vira PRODUTO
-- separado. O papel `produtor` (em `perfis.role`, texto livre — nenhum CHECK
-- a barrar) entra por CPF+senha como o supervisor, mas:
--   - só enxerga /gastos (o app/admin redireciona ele pra lá);
--   - só os eventos em `produtor_eventos`;
--   - amarrado a UMA organização (`perfis.organizacao_id`), que é a fronteira.
--
-- `master` continua com acesso ao módulo — só pra dar suporte. O item some do
-- menu dos outros papéis (ver lib/permissions.ts `podeRegistrarGastos`).
--
-- A arquitetura fica pronta pra vender Gastos sozinho: um produtor é uma conta
-- que não toca em NADA do credenciamento.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- Os eventos que um produtor pode ver/lançar gasto. Dentro da organização
-- dele (`perfis.organizacao_id`), só os que forem vinculados aqui.
create table if not exists produtor_eventos (
  id           uuid primary key default gen_random_uuid(),
  produtor_id  uuid not null references perfis(id) on delete cascade,
  evento_id    uuid not null references eventos(id) on delete cascade,
  criado_por   uuid references perfis(id) on delete set null,
  criado_em    timestamptz not null default now()
);

create unique index if not exists produtor_eventos_uniq on produtor_eventos (produtor_id, evento_id);
create index if not exists produtor_eventos_por_produtor on produtor_eventos (produtor_id);
create index if not exists produtor_eventos_por_evento on produtor_eventos (evento_id);

alter table produtor_eventos enable row level security;

-- Forma de pagamento do gasto — texto livre com sugestão no form
-- (lib/gastos-constantes.ts), mesma lógica de `categoria`.
alter table gastos_evento add column if not exists forma_pagamento text;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists produtor_eventos;
--     alter table gastos_evento drop column if exists forma_pagamento;
--     -- (perfis com role='produtor' podem ficar; sem a tabela eles não veem evento nenhum)
--   commit;
