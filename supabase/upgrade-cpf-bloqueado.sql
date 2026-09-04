-- ════════════════════════════════════════════════════════════════════════════
-- Bloqueio de CPF — barrar quem tenta entrar no evento sem trabalhar
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente muda.
--
-- POR QUE
--
-- Pedido dos supervisores (via Gabriel, 04/09/2026): "acharam furo, vão lá e
-- bloqueiam esse CPF". O caso é a pessoa que não deveria estar ali e insiste —
-- se cadastra de novo pelo link depois de ser tirada da equipe, ou aparece no
-- portão com um QR que não deveria valer mais.
--
-- Tirar da equipe (`descredenciar`) resolve o vínculo de HOJE, mas não impede
-- a pessoa de se cadastrar de novo pelo mesmo link cinco minutos depois. O
-- bloqueio é o que fecha essa porta.
--
-- ESCOPO: O EVENTO, E SO ELE
--
-- `evento_id` + `cpf` e a chave. Decidido com o Juan em 04/09/2026:
--
--   * Do EVENTO, nao do setor — barrar so num setor deixaria a pessoa se
--     cadastrar no setor ao lado, e o furo continuaria aberto.
--
--   * SO deste evento — a pessoa segue livre pra trabalhar em qualquer outro
--     evento da plataforma. E uma decisao operacional de um evento, tomada com
--     pressa no meio da correria; virar veto permanente ao trabalho de alguem
--     seria outra coisa, de outro peso.
--
-- `fornecedor_id` continua na tabela, e nulo, so pra registrar de qual setor
-- veio o pedido no dia em que isso for util. Nada le essa coluna.
--
-- CPF guardado SÓ COM DÍGITOS (a action normaliza) — é como `funcionarios.cpf`
-- já é gravado, e é o que faz a comparação bater sem depender de máscara.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists cpfs_bloqueados (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references eventos(id) on delete cascade,
  -- Sempre NULL hoje: o bloqueio e do evento. Guardado so como origem.
  fornecedor_id  uuid references fornecedores(id) on delete cascade,
  cpf            text not null,
  motivo         text,
  bloqueado_por  uuid references perfis(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- O mesmo CPF nao entra duas vezes no mesmo evento. `coalesce` porque NULL
-- nunca e igual a NULL num indice unico — sem isso, dois bloqueios do mesmo
-- CPF passariam.
create unique index if not exists cpfs_bloqueados_uniq
  on cpfs_bloqueados (evento_id, coalesce(fornecedor_id, '00000000-0000-0000-0000-000000000000'::uuid), cpf);

-- A consulta quente: "este CPF esta barrado neste evento?", em todo cadastro
-- pelo link e em toda leitura de QR.
create index if not exists cpfs_bloqueados_busca
  on cpfs_bloqueados (evento_id, cpf);

alter table cpfs_bloqueados enable row level security;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists cpfs_bloqueados;
--   commit;
