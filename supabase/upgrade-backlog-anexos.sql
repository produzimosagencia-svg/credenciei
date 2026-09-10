-- ════════════════════════════════════════════════════════════════════════════
-- Backlog — anexos de imagem no item (como as fotos de um card do Trello)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Uma tabela nova + um bucket privado. Nada muda.
--
-- POR QUE UMA TABELA, E NÃO UMA COLUNA
--
-- Um item pode ter várias fotos, e cada uma se apaga sozinha. Linha por anexo
-- (com quem subiu e quando) é o que deixa listar, remover e auditar sem mexer
-- no item. `on delete cascade` no `item_id`: apagou o item, somem os anexos —
-- os arquivos no bucket a action limpa junto.
--
-- BUCKET PRÓPRIO, PRIVADO
--
-- Separado de `gastos`, `financeiro` e `presencas` de propósito: é material
-- comercial interno (proposta, print de conversa, logo do lead). URL assinada
-- na hora de abrir, nunca link público.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists backlog_anexos (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references backlog_itens(id) on delete cascade,
  -- Caminho no bucket `backlog` (privado).
  path        text not null,
  nome        text not null,
  -- Tipo do arquivo, pra tela decidir se mostra como imagem.
  mime        text,
  tamanho     integer,
  criado_por  uuid references perfis(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists backlog_anexos_por_item on backlog_anexos (item_id, created_at);

alter table backlog_anexos enable row level security;

insert into storage.buckets (id, name, public)
values ('backlog', 'backlog', false)
on conflict (id) do nothing;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists backlog_anexos;
--     delete from storage.objects where bucket_id = 'backlog';
--     delete from storage.buckets where id = 'backlog';
--   commit;
