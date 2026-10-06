-- ============================================================
-- Depoimento do colaborador — o histórico de COMPORTAMENTO da pessoa
--
-- Observações que quem gerencia a equipe escreve sobre um colaborador
-- ("chegou atrasado", "ótimo no bar", "brigou com o cliente") e que ficam
-- guardadas na PESSOA — para os próximos eventos —, não no cadastro de um
-- evento só.
--
-- ─── POR QUE A CHAVE É O CPF ────────────────────────────────────────────────
--
-- A pessoa existe uma linha por evento em `funcionarios`. Pendurar o
-- depoimento nessa linha o perderia quando o cadastro fosse apagado, e a
-- pessoa que voltar num evento novo nasceria "limpa". O CPF é a identidade
-- (é assim que a Base de funcionários junta a história dela), então é ele que
-- guarda o texto — e por isso o histórico sobrevive a bloqueio de CPF, a
-- cadastro apagado e a evento encerrado.
--
-- Nome do evento, do setor e do autor ficam COPIADOS na linha: o evento pode
-- ser apagado e o autor pode sair do sistema, e o depoimento continua legível.
--
-- Bloquear e liberar um CPF também gravam uma linha aqui (tipo 'bloqueio' /
-- 'desbloqueio', com o motivo): é parte do comportamento da pessoa.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

create table if not exists depoimentos_colaborador (
  id uuid primary key default gen_random_uuid(),
  cpf text not null,
  nome_na_epoca text,
  funcionario_id uuid references funcionarios(id) on delete set null,
  evento_id uuid references eventos(id) on delete set null,
  evento_nome text,
  organizacao_id uuid references organizacoes(id) on delete set null,
  setor_nome text,
  -- 'positivo' / 'neutro' / 'atencao' são as escolhas de quem escreve;
  -- 'bloqueio' e 'desbloqueio' o sistema grava sozinho.
  tipo text not null default 'neutro'
    check (tipo in ('positivo', 'neutro', 'atencao', 'bloqueio', 'desbloqueio')),
  texto text not null check (char_length(texto) between 3 and 2000),
  autor_id uuid references perfis(id) on delete set null,
  autor_nome text not null,
  created_at timestamptz not null default now()
);

-- "Todos os depoimentos desta pessoa, do mais novo ao mais antigo" — a consulta da aba.
create index if not exists depoimentos_colaborador_cpf_idx
  on depoimentos_colaborador (cpf, created_at desc);
-- O que cada organização escreveu (quem não é master só vê o da própria).
create index if not exists depoimentos_colaborador_org_idx
  on depoimentos_colaborador (organizacao_id);

-- Mesmo padrão das tabelas novas: o acesso é só pelo servidor (service role).
alter table depoimentos_colaborador enable row level security;

-- ============================================================
-- Avaliação por ESTRELAS (1 a 5) — o supervisor avalia cada pessoa da equipe
-- depois do evento. Uma nota por cadastro (colaborador + evento), que ele pode
-- ajustar. Guarda o CPF como o depoimento: a média acompanha a PESSOA pelos
-- eventos, mesmo se o cadastro de um evento for apagado.
-- ============================================================

create table if not exists avaliacoes_colaborador (
  id uuid primary key default gen_random_uuid(),
  -- Uma nota por cadastro; se o cadastro for apagado a nota some junto, mas o
  -- histórico de depoimentos (acima) continua.
  funcionario_id uuid not null unique references funcionarios(id) on delete cascade,
  cpf text not null,
  evento_id uuid references eventos(id) on delete set null,
  evento_nome text,
  organizacao_id uuid references organizacoes(id) on delete set null,
  setor_nome text,
  nota smallint not null check (nota between 1 and 5),
  avaliador_id uuid references perfis(id) on delete set null,
  avaliador_nome text not null,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists avaliacoes_colaborador_cpf_idx on avaliacoes_colaborador (cpf);
create index if not exists avaliacoes_colaborador_evento_idx on avaliacoes_colaborador (evento_id);

alter table avaliacoes_colaborador enable row level security;
