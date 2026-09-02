-- ════════════════════════════════════════════════════════════════════════════
-- Avisos — comunicados do admin pro funcionário/supervisor, no link de acesso
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente muda.
--
-- POR QUE ESTAS TABELAS
--
-- `avisos` vive por EVENTO (`evento_id`), igual Presença e Relatórios — não é
-- uma área global cruzando eventos. `publico` decide quem recebe: 'todos',
-- 'setores' (m:n com `fornecedores` via `aviso_setores`), 'pessoa' (uma única
-- pessoa) ou 'supervisores' (todo perfil com role='supervisor').
--
-- `cpf_pessoa` (texto, sem FK) em vez de um `funcionario_id` fixo: o mesmo
-- aviso precisa casar tanto com a credencial pública (identificada por
-- `funcionarios`) quanto com o login do supervisor (identificado por
-- `perfis`) — CPF é a única chave que cruza as duas tabelas hoje, mesmo
-- raciocínio já usado em `editarCpfFuncionario`/`situacaoDoAcesso`.
--
-- `aviso_visualizacoes` tem DOIS identificadores opcionais (`funcionario_id`
-- OU `perfil_id`, nunca os dois) de propósito: confirmar o aviso na
-- credencial não dispensa confirmar de novo no painel do supervisor — são
-- experiências diferentes (bater ponto vs. tocar a operação), então contam
-- como contextos independentes.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ
--
-- Não mexe em `funcionarios`, `perfis` nem `fornecedores`. Não cria RLS (o
-- projeto inteiro é service-role-only — ver `disable row level security`
-- abaixo, mesmo padrão de `supervisor_setores`).
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists avisos (
  id           uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references eventos(id) on delete cascade,
  titulo       text not null,
  mensagem     text not null,
  ativo        boolean not null default true,
  data_inicio  date not null default current_date,
  data_fim     date,
  publico      text not null default 'todos'
               check (publico in ('todos', 'setores', 'pessoa', 'supervisores')),
  cpf_pessoa   text,
  recorrente   boolean not null default false,
  criado_por   uuid references perfis(id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table avisos is
  'Comunicado do admin exibido em modal ao funcionário (credencial pública) '
  'e/ou ao supervisor (painel do setor). `recorrente=false` (padrão) mostra '
  'só uma vez por pessoa; `recorrente=true` mostra toda vez que a pessoa '
  'acessar, enquanto o aviso estiver ativo e dentro do período.';

create index if not exists avisos_evento on avisos(evento_id);
create index if not exists avisos_ativo_periodo on avisos(evento_id, ativo, data_inicio, data_fim);

create table if not exists aviso_setores (
  aviso_id      uuid not null references avisos(id) on delete cascade,
  fornecedor_id uuid not null references fornecedores(id) on delete cascade,
  primary key (aviso_id, fornecedor_id)
);

create index if not exists aviso_setores_fornecedor on aviso_setores(fornecedor_id);

create table if not exists aviso_visualizacoes (
  id              uuid primary key default gen_random_uuid(),
  aviso_id        uuid not null references avisos(id) on delete cascade,
  funcionario_id  uuid references funcionarios(id) on delete cascade,
  perfil_id       uuid references perfis(id) on delete cascade,
  visualizado_em  timestamptz not null default now(),
  constraint aviso_visualizacoes_um_identificador check (
    (funcionario_id is not null and perfil_id is null) or
    (funcionario_id is null and perfil_id is not null)
  )
);

create unique index if not exists aviso_visualizacoes_funcionario_uniq
  on aviso_visualizacoes (aviso_id, funcionario_id) where funcionario_id is not null;
create unique index if not exists aviso_visualizacoes_perfil_uniq
  on aviso_visualizacoes (aviso_id, perfil_id) where perfil_id is not null;

alter table avisos disable row level security;
alter table aviso_setores disable row level security;
alter table aviso_visualizacoes disable row level security;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists aviso_visualizacoes;
--     drop table if exists aviso_setores;
--     drop table if exists avisos;
--   commit;
