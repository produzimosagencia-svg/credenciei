-- ════════════════════════════════════════════════════════════════════════════
-- Backlog Operacional — CRM/tarefas internas do Credenciei (só MASTER)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente muda.
--
-- POR QUE MASTER, NÃO POR ORGANIZAÇÃO
--
-- O Backlog é o pipeline comercial e operacional DO CREDENCIEI — "quem são
-- os próximos clientes", "o que está em negociação". Não é uma ferramenta
-- de um cliente sobre o próprio evento; é a agência olhando o próprio
-- negócio. Um "Possível Cliente" nem é organização ainda — é exatamente o
-- que NÃO existe como linha em `organizacoes`. Por isso não tem
-- `organizacao_id` de dono: o dono é a plataforma. Ver `podeGerenciarBacklog`
-- em lib/permissions.ts.
--
-- UMA TABELA, DOIS TIPOS
--
-- `tipo` decide o que os outros campos significam: 'cliente' usa
-- contato/whatsapp/origem_lead/próximo contato; 'tarefa' usa
-- descrição/prazo. Os dois dividem título, status, prioridade, responsável
-- e evento — por isso uma tabela só, com colunas de um tipo ficando NULL
-- pro outro, em vez de duas tabelas espelhadas que precisariam da mesma
-- lista de filtros, do mesmo histórico, da mesma tela.
--
-- `status` é texto livre — os dois vocabulários (cliente x tarefa) vivem no
-- código (lib/backlog-constantes.ts), sem CHECK constraint, mesma razão de
-- `custos_evento.categoria`: uma coluna de status nova não pode exigir
-- migração de banco.
--
-- CONVERSÃO NÃO DUPLICA
--
-- "Converter em cliente" não cria uma organização nova sozinho — linka
-- `convertido_organizacao_id` a uma organização JÁ escolhida (existente ou
-- criada pelo fluxo de sempre em /admin/organizacoes/novo). O item do
-- Backlog continua existindo, com o histórico inteiro — a conversão é só
-- mais uma entrada nesse histórico.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists backlog_itens (
  id                    uuid primary key default gen_random_uuid(),
  -- 'cliente' | 'tarefa'
  tipo                  text not null,
  -- Nome da empresa/cliente (tipo cliente) ou título da tarefa (tipo tarefa).
  titulo                text not null,
  status                text not null,
  -- 'alta' | 'media' | 'baixa'
  prioridade            text not null default 'media',
  responsavel_id        uuid references perfis(id) on delete set null,
  -- Vínculo com um evento JÁ CADASTRADO — sempre opcional (seção 10 do pedido).
  evento_id             uuid references eventos(id) on delete set null,

  -- Tipo TAREFA
  descricao             text,
  prazo                 date,

  -- Tipo CLIENTE (possível cliente)
  contato_nome          text,
  whatsapp              text,
  email                 text,
  -- Nome do evento PREVISTO — texto livre, porque o evento ainda pode nem
  -- existir no sistema (é só uma intenção do lead). Diferente de `evento_id`
  -- acima, que aponta pra um evento real já cadastrado.
  evento_previsto_nome  text,
  data_evento_prevista  date,
  quantidade_estimada   integer,
  servico_interesse     text,
  origem_lead           text,
  proximo_contato_data  date,

  observacoes           text,

  -- Preenchidos só quando "Converter em cliente" é confirmado.
  convertido_organizacao_id uuid references organizacoes(id) on delete set null,
  convertido_em         timestamptz,

  criado_por            uuid references perfis(id) on delete set null,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- Histórico cronológico — cada mudança relevante vira uma linha (seção 12).
create table if not exists backlog_historico (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references backlog_itens(id) on delete cascade,
  -- CRIACAO, STATUS, RESPONSAVEL, PRIORIDADE, PRAZO, COMENTARIO, CONVERSAO, CONCLUSAO
  acao           text not null,
  valor_anterior text,
  valor_novo     text,
  autor_id       uuid references perfis(id) on delete set null,
  criado_em      timestamptz not null default now()
);

-- As consultas quentes: Kanban por tipo+status, "minhas tarefas" por
-- responsável, próximos contatos por data, itens de um evento.
create index if not exists backlog_itens_tipo_status on backlog_itens (tipo, status);
create index if not exists backlog_itens_responsavel on backlog_itens (responsavel_id);
create index if not exists backlog_itens_proximo_contato on backlog_itens (proximo_contato_data);
create index if not exists backlog_itens_prazo on backlog_itens (prazo);
create index if not exists backlog_itens_evento on backlog_itens (evento_id);
create index if not exists backlog_historico_item on backlog_historico (item_id, criado_em);

alter table backlog_itens enable row level security;
alter table backlog_historico enable row level security;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists backlog_historico;
--     drop table if exists backlog_itens;
--   commit;
