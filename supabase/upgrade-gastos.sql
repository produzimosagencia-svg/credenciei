-- ════════════════════════════════════════════════════════════════════════════
-- Módulo Gastos — registro de despesa de evento por voz (produtor)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente muda.
--
-- POR QUE UMA TABELA NOVA, E NÃO `custos_evento`
--
-- `custos_evento` é do módulo Financeiro, que é exclusivo do master: é a
-- agência lançando o custo dela, na mesa, com hora escolhida. `gastos_evento`
-- é o oposto — o PRODUTOR, no meio do evento, falando "gastei 850 com
-- estrutura" e confirmando num toque. Público diferente, permissão diferente,
-- ciclo de vida diferente. O Juan pediu (10/09/2026) que os dois fiquem
-- TOTALMENTE isolados, sem ligação nem futura, pra este módulo poder virar um
-- produto financeiro próprio (orçamento, contas a pagar, centro de custos)
-- sem arrastar o credenciamento junto.
--
-- DUAS DATAS, DE PROPÓSITO
--
-- `data_gasto` é quando o dinheiro saiu — pode vir do áudio ("ontem gastei
-- 500"). `registrado_em` é quando entrou no sistema, sempre `now()`. A
-- planilha de exportação mostra as duas, porque um gasto de ontem lançado
-- hoje precisa aparecer na conta de ontem, mas o rastro de quando foi
-- digitado não pode se perder.
--
-- `categoria` É TEXTO LIVRE — sem CHECK constraint, mesma razão de
-- `custos_evento.categoria` e `backlog_itens.status`: a lista de categorias
-- vive no código (lib/gastos-constantes.ts), e adicionar uma nova não pode
-- exigir migração de banco.
--
-- `transcricao` guarda o que a IA ouviu, só quando `origem = 'audio'` — é a
-- prova de que o valor salvo bate com o que foi falado, útil quando o
-- produtor revisa um gasto semanas depois.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists gastos_evento (
  id                uuid primary key default gen_random_uuid(),
  evento_id         uuid not null references eventos(id) on delete cascade,
  descricao         text not null,
  valor             numeric(12,2) not null check (valor >= 0),
  -- Nome do fornecedor como o produtor fala ("XYZ", "João da estrutura",
  -- "Posto X"). Texto livre, opcional — não é a tabela `fornecedores` (aquela
  -- é setor de evento, com supervisor).
  fornecedor        text,
  categoria         text not null default 'Outros',
  -- Quando o gasto aconteceu. Default hoje em Brasília — o servidor roda em
  -- Washington, `now()::date` lá pode ser o dia seguinte.
  data_gasto        date not null default (now() at time zone 'America/Sao_Paulo')::date,
  registrado_em     timestamptz not null default now(),
  -- 'manual' | 'audio' | 'whatsapp' — 'whatsapp' já previsto pro futuro.
  origem            text not null default 'manual',
  -- 'confirmado' | 'rascunho' — abre espaço pra fluxo de aprovação depois.
  status            text not null default 'confirmado',
  observacao        text,
  transcricao       text,
  -- Caminho no bucket `gastos` (privado — URL assinada na hora de abrir).
  comprovante_path  text,
  comprovante_nome  text,
  criado_por        uuid references perfis(id) on delete set null,
  atualizado_em     timestamptz not null default now()
);

-- As consultas quentes: gastos de um evento, o dashboard por período, e as
-- quebras por categoria e por fornecedor dos gráficos.
create index if not exists gastos_evento_por_evento     on gastos_evento (evento_id);
create index if not exists gastos_evento_por_data       on gastos_evento (data_gasto);
create index if not exists gastos_evento_por_categoria  on gastos_evento (categoria);
create index if not exists gastos_evento_por_fornecedor on gastos_evento (fornecedor);

alter table gastos_evento enable row level security;

-- Bucket privado próprio — separado de `financeiro` e de `presencas` de
-- propósito: um comprovante de gasto do produtor não é uma NFe do master nem
-- uma foto de presença, e não deveria dividir pasta com nenhum dos dois.
insert into storage.buckets (id, name, public)
values ('gastos', 'gastos', false)
on conflict (id) do nothing;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists gastos_evento;
--     delete from storage.objects where bucket_id = 'gastos';
--     delete from storage.buckets where id = 'gastos';
--   commit;
