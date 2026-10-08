-- ════════════════════════════════════════════════════════════════════════════
-- Pedido de setor (formulário público + aprovação do admin) e
-- pedido de MAIS colaboradores (do supervisor para o admin)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Não toca em nenhuma tabela existente além de acrescentar
-- 3 colunas em `eventos` (todas desligadas por padrão).
--
-- ─── O QUE É ────────────────────────────────────────────────────────────────
--
-- 1. PEDIDO DE SETOR. O fornecedor abre um link público do evento, informa o(s)
--    setor(es), quantas pessoas quer por dia e quem será o supervisor. O pedido
--    cai numa fila; o admin/master do evento edita o que quiser e aprova ou
--    nega CADA setor (um pedido pode ter vários, e ser aprovado em parte).
--    Aprovado, o setor e o supervisor nascem pelo mesmo caminho da tela de
--    fornecedores (e o supervisor recebe a mesma mensagem de sempre).
--
-- 2. PEDIDO DE MAIS COLABORADORES. O supervisor, na tela do setor dele, diz
--    quantos tem, quantos quer e por quê. O admin/master aprova (com outro
--    número, se quiser) ou nega com motivo.
--
-- ─── POR QUE O LINK NASCE DESLIGADO ─────────────────────────────────────────
--
-- `pedido_setor_ativo` começa `false` e o token só é criado quando o admin liga
-- pela primeira vez (mesmo cuidado do cartaz da portaria): nenhum evento
-- existente ganha uma porta pública sem ninguém pedir.
--
-- ─── POR QUE GUARDAR O PEDIDO ORIGINAL ──────────────────────────────────────
--
-- `pedidos_setor_itens.original` é a fotografia do que o fornecedor enviou. O
-- admin edita os campos de trabalho (nome, subevento, quantidades, supervisor);
-- o original fica para mostrar "pediu 10, aprovado 7" e para conferir depois
-- quem passou do combinado.
--
-- Acesso só pelo servidor (service role), como as demais tabelas novas.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─── O link público de cada evento ──────────────────────────────────────────
alter table eventos
  add column if not exists pedido_setor_token text,
  add column if not exists pedido_setor_ativo boolean not null default false,
  add column if not exists pedido_setor_prazo timestamptz;

create unique index if not exists eventos_pedido_setor_token_unico
  on eventos (pedido_setor_token) where pedido_setor_token is not null;

comment on column eventos.pedido_setor_ativo is
  'true = o link público de pedido de setor aceita pedidos novos (enquanto não passar do prazo).';
comment on column eventos.pedido_setor_prazo is
  'Depois deste instante o link mostra "pedidos encerrados". Nulo = sem prazo.';

-- ─── Pedido de setor: a ficha enviada pelo fornecedor ───────────────────────
create table if not exists pedidos_setor (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos(id) on delete cascade,
  -- Endereço da página de acompanhamento (quem enviou vê "aguardando / aprovado / negado").
  token text not null unique,
  -- Quem preencheu: o supervisor responsável. É para ele que vai o aviso de reprovação.
  contato_nome text not null,
  contato_cpf text not null,
  contato_telefone text not null,
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists pedidos_setor_por_evento on pedidos_setor (evento_id, criado_em desc);

-- ─── Cada setor pedido (um pedido pode ter vários) ──────────────────────────
create table if not exists pedidos_setor_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_setor(id) on delete cascade,
  evento_id uuid not null references eventos(id) on delete cascade,
  ordem integer not null default 0,
  -- Campos de trabalho: o admin pode editar tudo isto antes de decidir.
  nome text not null,
  subevento_id uuid references subeventos(id) on delete set null,
  quantidade integer check (quantidade is null or quantidade > 0),
  -- { "2026-10-10": 8, "2026-10-11": 6 } — pessoas por dia de trabalho.
  quantidade_por_dia jsonb not null default '{}'::jsonb,
  supervisor_nome text not null,
  supervisor_cpf text not null,
  supervisor_telefone text not null,
  -- Como o fornecedor enviou (não muda depois).
  original jsonb not null default '{}'::jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'negado')),
  motivo_negacao text,
  decidido_por uuid references perfis(id) on delete set null,
  decidido_em timestamptz,
  -- O setor criado quando aprovado.
  fornecedor_id uuid references fornecedores(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists pedidos_setor_itens_por_pedido on pedidos_setor_itens (pedido_id, ordem);
create index if not exists pedidos_setor_itens_por_evento on pedidos_setor_itens (evento_id, status);

-- ─── Pedido de mais colaboradores ───────────────────────────────────────────
create table if not exists pedidos_ampliacao (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos(id) on delete cascade,
  fornecedor_id uuid not null references fornecedores(id) on delete cascade,
  solicitante_id uuid references perfis(id) on delete set null,
  solicitante_nome text not null,
  -- O que o setor tinha quando o pedido foi feito (combinado e cadastrados).
  quantidade_atual integer,
  cadastrados integer,
  quantidade_desejada integer not null check (quantidade_desejada > 0),
  motivo text not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'negado')),
  quantidade_aprovada integer check (quantidade_aprovada is null or quantidade_aprovada > 0),
  motivo_negacao text,
  decidido_por uuid references perfis(id) on delete set null,
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists pedidos_ampliacao_por_evento on pedidos_ampliacao (evento_id, status, criado_em desc);
create index if not exists pedidos_ampliacao_por_setor on pedidos_ampliacao (fornecedor_id, criado_em desc);

alter table pedidos_setor enable row level security;
alter table pedidos_setor_itens enable row level security;
alter table pedidos_ampliacao enable row level security;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists pedidos_ampliacao;
--     drop table if exists pedidos_setor_itens;
--     drop table if exists pedidos_setor;
--     drop index if exists eventos_pedido_setor_token_unico;
--     alter table eventos
--       drop column if exists pedido_setor_prazo,
--       drop column if exists pedido_setor_ativo,
--       drop column if exists pedido_setor_token;
--   commit;
