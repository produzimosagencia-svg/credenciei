-- ════════════════════════════════════════════════════════════════════════════
-- Módulo Orçamentos — propostas comerciais da agência (master)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente muda.
--
-- POR QUE NÚMERO SEQUENCIAL, E NÃO UUID
--
-- Todo o resto do sistema identifica por UUID, mas um orçamento vai pro
-- CLIENTE — "#000001" no PDF é o que o comercial fala ao telefone ("me
-- confirma o orçamento 000004?"). `orcamentos_numero_seq` garante que nunca
-- repete e nunca precisa ser digitado.
--
-- VALOR_TOTAL É GRAVADO PELA APLICAÇÃO, NÃO GERADO PELO POSTGRES
--
-- Não dá pra usar `generated always as` porque a soma dos itens adicionais
-- mora em outra tabela (`orcamento_itens`) — coluna gerada do Postgres só
-- enxerga a própria linha. A aplicação grava `valor_total` no mesmo
-- insert/update que grava os itens (ver lib/actions-orcamentos.ts); quem lê
-- pra editar, pré-visualizar ou gerar o PDF recalcula a partir dos valores
-- brutos + itens (lib/orcamentos.ts, `orcamentoPorId`), então mesmo que a
-- coluna divergisse um dia, ninguém veria um total errado — só a LISTAGEM
-- confia na coluna gravada, por velocidade (evita somar itens de N
-- orçamentos numa lista).
--
-- STATUS É TEXTO LIVRE, SEM CHECK CONSTRAINT
--
-- Mesma decisão de `backlog_itens.status` e `gastos_evento.categoria`: a
-- régua vive no código (lib/orcamentos-constantes.ts), evoluir o fluxo de
-- aprovação não pode exigir migração de banco.
--
-- RLS SEM POLICY, DE PROPÓSITO
--
-- Nega tudo a `anon`/`authenticated`. Todo acesso real passa por
-- `supabaseAdmin` no servidor, depois de checar `podeGerenciarOrcamentos`.
-- Mesmo padrão de `gastos_evento`/`backlog_itens`.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create sequence if not exists orcamentos_numero_seq;

create table if not exists orcamentos (
  id                 uuid primary key default gen_random_uuid(),
  numero             integer not null unique default nextval('orcamentos_numero_seq'),
  nome_evento        text not null,
  responsavel        text not null,
  telefone           text,
  data_evento        date,
  valor_dia          numeric(10,2) not null default 0 check (valor_dia >= 0),
  valor_funcionario  numeric(10,2) not null default 0 check (valor_funcionario >= 0),
  valor_tecnico      numeric(10,2) not null default 0 check (valor_tecnico >= 0),
  -- Gravado pela aplicação a cada save (ver cabeçalho). Nunca editado à mão.
  valor_total        numeric(10,2) not null default 0 check (valor_total >= 0),
  observacoes        text,
  -- 'rascunho' | 'gerado' | 'enviado' | 'aprovado' | 'recusado'
  status             text not null default 'rascunho',
  created_by         uuid references perfis(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists orcamento_itens (
  id            uuid primary key default gen_random_uuid(),
  orcamento_id  uuid not null references orcamentos(id) on delete cascade,
  descricao     text not null,
  valor         numeric(10,2) not null default 0 check (valor >= 0),
  -- Ordem de exibição no PDF/form, na ordem em que a pessoa adicionou —
  -- não dá pra confiar em created_at porque dois itens podem nascer no
  -- mesmo insert, no mesmo milissegundo.
  posicao       integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists orcamentos_por_status        on orcamentos (status);
create index if not exists orcamentos_por_created_at     on orcamentos (created_at desc);
create index if not exists orcamento_itens_por_orcamento on orcamento_itens (orcamento_id);

alter table orcamentos enable row level security;
alter table orcamento_itens enable row level security;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists orcamento_itens;
--     drop table if exists orcamentos;
--     drop sequence if exists orcamentos_numero_seq;
--   commit;
