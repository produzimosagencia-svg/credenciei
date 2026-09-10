-- ════════════════════════════════════════════════════════════════════════════
-- Conferência de equipe — o supervisor confirma, 1 dia antes, quem é da equipe
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Uma tabela nova. Nada existente muda.
--
-- POR QUE
--
-- Pedido do Juan (reunião Kiki, 15/07): "1 dia antes do evento, cada supervisor
-- confere no sistema a lista da equipe dele e confirma quem realmente faz
-- parte". A remoção de quem não é da equipe reaproveita `descredenciar` (que
-- já marca `descredenciado_em` e registra na auditoria) — esta tabela só
-- guarda o ESTADO da conferência: feita ou não, por quem, quando.
--
-- UMA POR SETOR (`fornecedor_id` é a chave única)
--
-- Decidido por setor, não por supervisor-evento: um supervisor que cobre três
-- setores confere os três, cada um com a sua lista. `evento_id` fica guardado
-- (deriva de `fornecedores.evento_id`) só pra a consulta "quais setores deste
-- evento ainda não conferiram" não precisar de join.
--
-- `email_enviado_em` deixa o cron D-1 ser idempotente: roda todo dia, mas só
-- dispara o aviso uma vez por setor.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists conferencias_equipe (
  id               uuid primary key default gen_random_uuid(),
  evento_id        uuid not null references eventos(id) on delete cascade,
  fornecedor_id    uuid not null references fornecedores(id) on delete cascade,
  status           text not null default 'pendente',   -- 'pendente' | 'confirmada'
  -- Quem confirmou e quando.
  confirmada_por   uuid references perfis(id) on delete set null,
  confirmada_em    timestamptz,
  -- Fotografia do resultado, pro painel do organizador não recontar.
  total_mantidos   integer,
  total_removidos  integer,
  -- Controle do lembrete D-1 (cron).
  email_enviado_em timestamptz,
  criada_em        timestamptz not null default now()
);

create unique index if not exists conferencias_equipe_setor on conferencias_equipe (fornecedor_id);
create index if not exists conferencias_equipe_evento on conferencias_equipe (evento_id);

alter table conferencias_equipe enable row level security;

-- Email REAL do supervisor (o `perfis.email` dele é sintético: `<cpf>@interno`,
-- só serve pra login). Opcional — preenchido na criação/edição do acesso. É
-- pra onde o lembrete D-1 com a planilha vai.
alter table perfis add column if not exists email_contato text;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists conferencias_equipe;
--     alter table perfis drop column if exists email_contato;
--   commit;
