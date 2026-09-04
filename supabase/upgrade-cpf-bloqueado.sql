-- ════════════════════════════════════════════════════════════════════════════
-- Bloqueio de CPF — o supervisor barra alguém do setor dele
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
-- ESCOPO: POR SETOR, NÃO POR EVENTO
--
-- `fornecedor_id` é a chave junto do CPF. Decidido com o Juan em 04/09/2026:
-- um supervisor barrar alguém do setor de outro, no meio da operação, é poder
-- demais pra quem responde por uma equipe só — é a mesma régua que já vale em
-- todo o resto (ele não vê nem edita gente de outro setor).
--
-- A coluna aceita NULL de propósito: NULL = bloqueio do EVENTO inteiro, para
-- quando o admin quiser barrar de vez. Nada usa isso hoje; existe pra que
-- ampliar depois seja mudar a consulta, não migrar a tabela de novo.
--
-- CPF guardado SÓ COM DÍGITOS (a action normaliza) — é como `funcionarios.cpf`
-- já é gravado, e é o que faz a comparação bater sem depender de máscara.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists cpfs_bloqueados (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references eventos(id) on delete cascade,
  -- NULL = o evento inteiro. Hoje sempre preenchido (bloqueio é por setor).
  fornecedor_id  uuid references fornecedores(id) on delete cascade,
  cpf            text not null,
  motivo         text,
  bloqueado_por  uuid references perfis(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- O mesmo CPF não entra duas vezes no mesmo setor. `coalesce` porque NULL
-- nunca é igual a NULL num índice único — sem isso, dois bloqueios de evento
-- inteiro do mesmo CPF passariam.
create unique index if not exists cpfs_bloqueados_uniq
  on cpfs_bloqueados (evento_id, coalesce(fornecedor_id, '00000000-0000-0000-0000-000000000000'::uuid), cpf);

-- A consulta quente: "este CPF está barrado neste setor?", em todo cadastro
-- pelo link e em toda leitura de QR.
create index if not exists cpfs_bloqueados_busca
  on cpfs_bloqueados (evento_id, cpf);

alter table cpfs_bloqueados enable row level security;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists cpfs_bloqueados;
--   commit;
