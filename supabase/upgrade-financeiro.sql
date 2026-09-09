-- ════════════════════════════════════════════════════════════════════════════
-- Financeiro — faturamento, custos e lucro por evento (só MASTER)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente muda.
--
-- POR QUE DUAS TABELAS NOVAS, E NÃO COLUNAS EM `eventos`
--
-- O pedido do Juan (09/09/2026) é explícito: "as informações financeiras
-- devem ficar completamente isoladas das demais áreas do sistema". Colocar
-- `faturamento` em `eventos` misturaria dado financeiro com dado operacional
-- na mesma linha, na mesma tabela que toda tela do sistema já consulta — e
-- a isolação vira só uma checagem de permissão em vez de uma fronteira real
-- de dados. Duas tabelas próprias, um bucket de storage próprio.
--
-- financeiro_eventos — UMA linha por evento: o faturamento e a NFe. Nasce
-- só quando o master salva o faturamento pela primeira vez (por isso
-- `evento_id` é único, não é criada junto com o evento).
--
-- custos_evento — VÁRIAS linhas por evento: o "+ Adicionar custo" do
-- pedido. Categoria é texto livre por decisão — a lista de exemplos do
-- Juan (WhatsApp, Funcionários, Transporte...) vive no código
-- (lib/financeiro.ts), não numa CHECK constraint, porque adicionar uma
-- categoria nova não pode exigir migração de banco.
--
-- `evento_id` ACEITA NULL — é a despesa INTERNA (Juan, 09/09/2026): salário
-- da equipe da agência, serviço contratado pra empresa, nada que pertença a
-- um evento específico. NULL vira "Interno" na tela de lançar NFe, e entra
-- nos totais gerais do dashboard sem aparecer em nenhum evento — porque não
-- é de nenhum.
--
-- Lucro e custo total NÃO são colunas — são sempre calculados na hora
-- (`lucroDoEvento` em lib/financeiro.ts): faturamento menos a soma dos
-- custos. Guardar o lucro pronto criaria um número que pode ficar
-- desatualizado assim que um custo for editado ou apagado.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists financeiro_eventos (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null unique references eventos(id) on delete cascade,
  faturamento    numeric(12,2) not null default 0,
  -- Caminho no bucket `financeiro` (privado — URL assinada na hora de ver).
  nfe_path       text,
  nfe_nome       text,
  atualizado_por uuid references perfis(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create table if not exists custos_evento (
  id                 uuid primary key default gen_random_uuid(),
  -- NULL = despesa interna (não pertence a evento nenhum). Ver o comentário
  -- acima.
  evento_id          uuid references eventos(id) on delete cascade,
  descricao          text not null,
  categoria          text not null,
  valor              numeric(12,2) not null,
  data               date not null,
  observacao         text,
  comprovante_path   text,
  comprovante_nome   text,
  criado_por         uuid references perfis(id) on delete set null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

-- A consulta quente: "os custos deste evento", e o dashboard geral filtrando
-- por período e por categoria.
create index if not exists custos_evento_por_evento on custos_evento (evento_id);
create index if not exists custos_evento_por_data on custos_evento (data);
create index if not exists custos_evento_por_categoria on custos_evento (categoria);

/*
 * Solta o NOT NULL mesmo que a tabela já exista de uma execução anterior
 * desta migração — `create table if not exists` acima é pulado inteiro
 * quando a tabela já está lá, e sozinho NÃO alteraria a coluna que já
 * nasceu `not null` na primeira vez que esta migração rodou (09/09/2026,
 * antes do pedido do "Interno"). Sem esta linha, lançar um custo Interno
 * quebra com "null value in column evento_id violates not-null
 * constraint" mesmo depois deste arquivo ser atualizado. `drop not null`
 * é idempotente — rodar de novo numa coluna que já aceita NULL não faz
 * nada, então é seguro em qualquer ordem de execução.
 */
alter table custos_evento alter column evento_id drop not null;

alter table financeiro_eventos enable row level security;
alter table custos_evento enable row level security;

-- Bucket privado próprio — separado de `presencas` de propósito, mesma
-- razão da isolação acima: um comprovante financeiro não é uma foto de
-- presença, e não deveria compartilhar pasta com uma.
insert into storage.buckets (id, name, public)
values ('financeiro', 'financeiro', false)
on conflict (id) do nothing;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists custos_evento;
--     drop table if exists financeiro_eventos;
--     delete from storage.objects where bucket_id = 'financeiro';
--     delete from storage.buckets where id = 'financeiro';
--   commit;
