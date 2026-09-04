-- ════════════════════════════════════════════════════════════════════════════
-- Permissões editáveis por organização — a tela de Configurações
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente muda.
--
-- POR QUE
--
-- Quem pode o quê vivia só no código (`lib/permissions.ts`), e mudar era
-- pedir deploy. Cada organização tem um jeito de trabalhar — numa, o
-- supervisor escaneia; noutra, jamais — e isso não devia ser decidido por
-- quem escreve o sistema.
--
-- A TABELA VAZIA É O SISTEMA DE HOJE
--
-- Cada linha é uma EXCEÇÃO à regra do código, não a regra inteira. Sem linha
-- nenhuma, todo papel se comporta exatamente como antes desta migração —
-- é o que permite ligar isto na véspera de um evento sem risco. Apagar uma
-- linha devolve o padrão do código; não existe estado "sem regra".
--
-- ESCOPO
--
-- `organizacao_id` nulo = padrão da PLATAFORMA, aplicado a toda organização
-- que não tenha a sua própria linha para aquela permissão. A ordem é:
-- linha da organização > linha da plataforma > padrão do código.
--
-- MASTER NÃO ENTRA
--
-- A checagem em `lib/permissions.ts` ignora qualquer linha com role
-- 'master'. Uma tela de permissões que consegue tirar a permissão de mexer
-- na tela de permissões é uma tela que se tranca sozinha, e a saída seria
-- pelo banco. A restrição mora no código de propósito: aqui um `insert`
-- manual não a contorna sem alguém ter lido este comentário.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists permissoes_organizacao (
  id             uuid primary key default gen_random_uuid(),
  -- NULL = padrão da plataforma (vale pra quem não tem linha própria).
  organizacao_id uuid references organizacoes(id) on delete cascade,
  -- 'admin', 'supervisor', 'operador_portao', 'suporte' — nunca 'master'.
  role           text not null,
  -- A chave da capacidade, em `CAPACIDADES` (lib/permissions.ts).
  chave          text not null,
  permitido      boolean not null,
  atualizado_por uuid references perfis(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- Uma linha por (organização, papel, capacidade). `coalesce` porque NULL
-- nunca é igual a NULL num índice único — sem isso, o padrão da plataforma
-- entraria duplicado.
create unique index if not exists permissoes_organizacao_uniq
  on permissoes_organizacao (coalesce(organizacao_id, '00000000-0000-0000-0000-000000000000'::uuid), role, chave);

-- A consulta quente: roda em TODA requisição autenticada (`getPerfil`).
create index if not exists permissoes_organizacao_busca
  on permissoes_organizacao (organizacao_id);

alter table permissoes_organizacao enable row level security;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists permissoes_organizacao;
--   commit;
