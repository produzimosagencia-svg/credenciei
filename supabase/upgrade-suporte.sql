-- ════════════════════════════════════════════════════════════════════════════
-- Papel SUPORTE — corrige a operação, nunca administra
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela/coluna existente muda de sentido.
--
-- ─── O PEDIDO ───────────────────────────────────────────────────────────────
--
-- Gente CONTRATADA pro dia do evento, pra resolver os mesmos problemas de
-- sempre — CPF errado, pessoa no setor errado, ponto que não bateu,
-- supervisor sem senha — sem dar acesso de admin/master. Decisão registrada
-- em 02/09/2026 (ver `lib/permissions.ts`, comentário de `podeEditarIdentidade`
-- antes desta migração), especificada em detalhe pelo Juan e construída aqui.
--
-- ─── POR QUE PERMISSÃO FIXA, NÃO 14 FLAGS POR PESSOA ────────────────────────
--
-- O sistema inteiro já funciona com papel → conjunto fixo de capacidades
-- (`lib/permissions.ts`): supervisor, operador_portao, admin. Suporte segue o
-- mesmo modelo — decisão do Juan, evitando um motor de permissões granulares
-- novo a 3 dias do evento. O que VARIA por pessoa é o ESCOPO (quais
-- organizações/eventos ela atende) e a EXPIRAÇÃO — as duas coisas que este
-- arquivo cria.
--
-- ─── POR QUE organizacao_id OU evento_id, NUNCA OS DOIS ─────────────────────
--
-- Mesmo raciocínio de `aviso_visualizacoes` (funcionario_id OU perfil_id):
-- uma linha por escopo, XOR entre organização inteira e evento avulso. Uma
-- pessoa pode ter várias linhas — organização inteira de um cliente, mais um
-- evento avulso de outro.
--
-- ─── AUDITORIA GENÉRICA, NÃO SÓ DO SUPORTE ──────────────────────────────────
--
-- `alteracoes_cadastro` é chamada por QUALQUER papel que executar uma ação
-- sensível (`editarCpfFuncionario`, `moverFuncionarioDeSetor` etc.) — não só
-- quando o autor é suporte. Hoje essas ações não deixam rastro nenhum, nem
-- pro master; ter dois caminhos (um com auditoria, um sem) seria pior que
-- gravar sempre.
--
-- ─── RLS ─────────────────────────────────────────────────────────────────
--
-- Mesmo padrão do resto do banco desde `upgrade-rls-lockdown.sql`: RLS
-- LIGADO, sem nenhuma policy — só a service role (usada em todo o servidor)
-- acessa. Esta migração também FECHA um gap encontrado: `avisos`,
-- `aviso_setores`, `aviso_visualizacoes` e `supervisor_setores` (criadas em
-- sessões anteriores) tinham RLS desligado, diferente do resto do banco.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1) Novo papel ────────────────────────────────────────────────────────
alter table perfis drop constraint if exists perfis_role_check;
alter table perfis add constraint perfis_role_check
  check (role in ('master', 'admin', 'gerente', 'supervisor', 'cliente', 'operador_portao', 'suporte'));

-- ── 2) Expiração de acesso ───────────────────────────────────────────────
-- Genérica em `perfis` (qualquer papel poderia usar), mas só o suporte
-- recebe valor por enquanto. Nulo = sem expiração (todo perfil existente
-- continua exatamente como está).
alter table perfis add column if not exists acesso_expira_em timestamptz;

comment on column perfis.acesso_expira_em is
  'Depois desta data/hora, `getPerfil()` trata a conta como deslogada — mesmo '
  'tratamento de `ativo = false`. Nulo = sem expiração. Usado pelo papel '
  'suporte (acesso de apoio contratado só pro período do evento).';

-- ── 3) Escopo do suporte ─────────────────────────────────────────────────
create table if not exists suporte_escopo (
  id             uuid primary key default gen_random_uuid(),
  perfil_id      uuid not null references perfis(id) on delete cascade,
  organizacao_id uuid references organizacoes(id) on delete cascade,
  evento_id      uuid references eventos(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint suporte_escopo_um_alvo check (
    (organizacao_id is not null and evento_id is null) or
    (organizacao_id is null and evento_id is not null)
  )
);

comment on table suporte_escopo is
  'A que organização (inteira) OU evento (avulso) um perfil de suporte '
  'atende. Uma pessoa pode ter várias linhas. Nunca os dois campos juntos '
  'na mesma linha — ver constraint suporte_escopo_um_alvo.';

create index if not exists suporte_escopo_perfil on suporte_escopo(perfil_id);
create index if not exists suporte_escopo_organizacao on suporte_escopo(organizacao_id);
create index if not exists suporte_escopo_evento on suporte_escopo(evento_id);

-- ── 4) Auditoria de alterações de cadastro ───────────────────────────────
create table if not exists alteracoes_cadastro (
  id                     uuid primary key default gen_random_uuid(),
  usuario_responsavel    text not null,
  usuario_responsavel_id uuid references perfis(id) on delete set null,
  organizacao_id         uuid references organizacoes(id) on delete set null,
  evento_id              uuid references eventos(id) on delete set null,
  funcionario_id         uuid references funcionarios(id) on delete set null,
  acao                   text not null,
  campo_alterado         text,
  valor_anterior         text,
  valor_novo             text,
  motivo                 text,
  ip                     text,
  created_at             timestamptz not null default now()
);

comment on table alteracoes_cadastro is
  'Trilha de auditoria de ações sensíveis (correção de cadastro, mudança de '
  'setor, ativação/desativação, ponto assistido, reset de senha...). Gravada '
  'por qualquer papel que executar a ação, não só suporte. `usuario_responsavel` '
  'guarda o nome no MOMENTO da ação (não depende de um join que pode quebrar '
  'se o perfil for excluído depois).';

create index if not exists alteracoes_cadastro_funcionario on alteracoes_cadastro(funcionario_id);
create index if not exists alteracoes_cadastro_evento on alteracoes_cadastro(evento_id);
create index if not exists alteracoes_cadastro_responsavel on alteracoes_cadastro(usuario_responsavel_id);
create index if not exists alteracoes_cadastro_created_at on alteracoes_cadastro(created_at desc);

-- ── 5) Trava RLS ──────────────────────────────────────────────────────────
alter table suporte_escopo enable row level security;
alter table alteracoes_cadastro enable row level security;

-- Gap de uma migração anterior: estas quatro nasceram sem RLS. Fecha agora,
-- mesmo padrão do resto — sem policy, só a service role acessa.
alter table avisos enable row level security;
alter table aviso_setores enable row level security;
alter table aviso_visualizacoes enable row level security;
alter table supervisor_setores enable row level security;

commit;

-- ROLLBACK
--   begin;
--     alter table avisos disable row level security;
--     alter table aviso_setores disable row level security;
--     alter table aviso_visualizacoes disable row level security;
--     alter table supervisor_setores disable row level security;
--     drop table if exists alteracoes_cadastro;
--     drop table if exists suporte_escopo;
--     alter table perfis drop column if exists acesso_expira_em;
--     alter table perfis drop constraint if exists perfis_role_check;
--     alter table perfis add constraint perfis_role_check
--       check (role in ('master', 'admin', 'gerente', 'supervisor', 'cliente', 'operador_portao'));
--   commit;
