-- ════════════════════════════════════════════════════════════════════════════
-- Encarregado — um acesso de CONSULTA que o supervisor delega a alguém da equipe
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Uma tabela nova, uma coluna em `organizacoes` e o papel
-- `encarregado` aceito em `perfis.role`.
--
-- ─── O QUE É ────────────────────────────────────────────────────────────────
--
-- O supervisor escolhe uma pessoa que JÁ está na equipe do setor dele e a
-- promove a Encarregado: ela ganha um login (CPF + senha, como o supervisor)
-- que só ENXERGA aquele setor — nenhuma ação operacional.
--
-- ─── POR QUE UMA TABELA À PARTE, E NÃO `supervisor_setores` ─────────────────
--
-- Em `supervisor_setores` cada linha vale PODER sobre o setor (a régua de
-- ~15 permissões do sistema pergunta "esta pessoa supervisiona este setor?").
-- Colocar o Encarregado ali daria a ele, de graça, tudo o que o supervisor faz.
-- Aqui a linha vale só LEITURA, e só as telas de consulta olham esta tabela.
--
-- ─── POR QUE `funcionario_id` AMARRA O ACESSO À EQUIPE ──────────────────────
--
-- O acesso nasce de uma pessoa da equipe e morre com ela: sair/ser apagado da
-- equipe (on delete cascade) leva o acesso junto. Um Encarregado nunca existe
-- fora da equipe do setor.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- O papel novo em perfis.role. O CHECK é refeito com todos os papéis que o
-- sistema usa hoje (o de produtor já tinha ficado de fora de versões antigas).
alter table perfis drop constraint if exists perfis_role_check;
alter table perfis add constraint perfis_role_check
  check (role in (
    'master', 'admin', 'gerente', 'supervisor', 'cliente',
    'operador_portao', 'suporte', 'produtor', 'encarregado'
  ));

-- Quem é Encarregado de quê. Cada linha é uma pessoa da equipe (funcionario_id)
-- em UM setor; a mesma pessoa pode ter várias linhas (um setor cada).
create table if not exists encarregados_setor (
  id               uuid primary key default gen_random_uuid(),
  perfil_id        uuid not null references perfis(id) on delete cascade,
  fornecedor_id    uuid not null references fornecedores(id) on delete cascade,
  -- A pessoa da equipe que recebeu a função. Apagou da equipe → some o acesso.
  funcionario_id   uuid not null references funcionarios(id) on delete cascade,
  -- O que este Encarregado pode consultar. Hoje só leitura da equipe do setor;
  -- a lista existe pra a gente liberar mais coisas no futuro (ex.: 'ver_contato')
  -- sem mexer na estrutura. Ver lib/encarregado.ts (PERMISSOES_ENCARREGADO).
  permissoes       text[] not null default '{}',
  concedido_por    uuid references perfis(id) on delete set null,
  concedido_por_nome text,
  created_at       timestamptz not null default now()
);

create unique index if not exists encarregados_setor_perfil_fornecedor
  on encarregados_setor (perfil_id, fornecedor_id);
-- Uma pessoa da equipe pode ser Encarregada de VÁRIOS setores (um cadastro, uma mensagem).
create unique index if not exists encarregados_setor_funcionario_fornecedor
  on encarregados_setor (funcionario_id, fornecedor_id);
create index if not exists encarregados_setor_fornecedor on encarregados_setor (fornecedor_id);
create index if not exists encarregados_setor_perfil on encarregados_setor (perfil_id);

-- Mesmo padrão das tabelas novas: o acesso é só pelo servidor (service role).
alter table encarregados_setor enable row level security;

-- A funcionalidade é LIGADA por organização (Configurações → Funcionalidades).
-- Nasce desligada: quem não pediu nunca vê nada disto.
alter table organizacoes add column if not exists encarregados_habilitado boolean not null default false;

commit;
