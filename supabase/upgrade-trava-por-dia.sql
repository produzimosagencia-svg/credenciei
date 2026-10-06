-- ============================================================
-- Trava do fornecedor POR DIA — importação de estrutura por planilha
--
-- A planilha de estrutura (Fornecedor | Subgrupo | Trava do setor por dia |
-- Supervisor...) traz o limite de pessoas por dia: "Sábado: 10 / Domingo: 8".
-- Até aqui a única cota era `fornecedores.quantidade_estimada`, um número só
-- para o evento inteiro.
--
-- Uma linha por (fornecedor, dia). Vale junto com a escala por dia
-- (upgrade-escala-por-dia.sql): o dia lotado aparece como "lotado" no
-- formulário e a aprovação acima do limite é recusada. Sem escala por dia, a
-- importação grava o MAIOR número em `quantidade_estimada` — o teto total de
-- sempre, com a trava de cota da organização.
--
-- Fornecedor sem linha aqui = sem trava por dia: NADA muda para ele.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

create table if not exists fornecedor_cotas_dia (
  fornecedor_id uuid not null references fornecedores(id) on delete cascade,
  data date not null,
  maximo integer not null check (maximo > 0),
  atualizado_em timestamptz not null default now(),
  primary key (fornecedor_id, data)
);

-- Mesmo padrão das tabelas novas: o acesso é só pelo servidor (service role).
alter table fornecedor_cotas_dia enable row level security;
