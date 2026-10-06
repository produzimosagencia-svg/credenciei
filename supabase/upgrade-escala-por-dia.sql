-- ============================================================
-- Escala por dia — eventos de subeventos
--
-- ─── O QUE MUDA ─────────────────────────────────────────────────────────────
--
-- Em evento de subeventos (eventos.tem_subeventos + organizacoes.subeventos_habilitado),
-- quem se cadastra pelo link escolhe EXATAMENTE os dias em que vai trabalhar
-- (montagem, evento, desmontagem — os dias de `jornada_dias`). O supervisor
-- confirma quais desses dias valem, e o QR Code só abre o portão nos dias
-- APROVADOS.
--
-- ─── POR QUE UMA TABELA NOVA (E SÓ UMA) ─────────────────────────────────────
--
-- `jornada_dias` responde "este dia é dia de trabalho no EVENTO?". A pergunta
-- nova é "este dia é dia de trabalho para ESTA PESSOA?" — uma linha por
-- (funcionário, data). Guardar isso como texto/array em `funcionarios`
-- impediria responder quem foi aprovado, por quem e quando, dia a dia.
--
-- O status da escala mora em `funcionarios` (ao lado de `status_credenciamento`,
-- que é a aprovação do cadastro): uma escala por funcionário, porque o vínculo
-- funcionário ↔ evento já é 1:1 (via fornecedor).
--
--   escala_status = null       → fora do fluxo (evento normal, cadastro feito
--                                pelo painel, ou anterior a este recurso).
--                                NADA muda para essa pessoa.
--   escala_status = 'pendente' → escolheu os dias, supervisor ainda não confirmou.
--                                QR recusado.
--   escala_status = 'aprovada' → QR vale SÓ nos dias com aprovado = true.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- Interruptor por organização (Configurações → Funcionalidades do Sistema).
-- Nasce DESLIGADO: nenhum cliente muda de comportamento sozinho.
alter table organizacoes add column if not exists escala_por_dia_habilitada boolean not null default false;

alter table funcionarios add column if not exists escala_status text;
alter table funcionarios drop constraint if exists funcionarios_escala_status_check;
alter table funcionarios add constraint funcionarios_escala_status_check
  check (escala_status is null or escala_status in ('pendente', 'aprovada'));

-- Última decisão sobre a escala inteira (aprovação inicial ou ajuste).
alter table funcionarios add column if not exists escala_decidida_por uuid references perfis(id) on delete set null;
alter table funcionarios add column if not exists escala_decidida_em timestamptz;

create table if not exists funcionario_dias (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios(id) on delete cascade,
  -- Redundante com funcionarios → fornecedores → eventos, de propósito:
  -- relatório "quem trabalha no dia X deste evento" sem três joins.
  evento_id uuid not null references eventos(id) on delete cascade,
  data date not null,
  -- O funcionário marcou este dia no formulário. Nunca muda depois do cadastro:
  -- é o registro do que ELE pediu.
  selecionado boolean not null default false,
  selecionado_em timestamptz,
  -- O supervisor confirmou este dia. É o que o QR Code respeita.
  aprovado boolean not null default false,
  decidido_por uuid references perfis(id) on delete set null,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  unique (funcionario_id, data)
);

-- A leitura do QR pergunta "esta pessoa tem este dia aprovado?" — a consulta quente.
create index if not exists funcionario_dias_aprovados_idx
  on funcionario_dias (funcionario_id, data) where aprovado;
-- Relatórios por dia do evento.
create index if not exists funcionario_dias_evento_idx on funcionario_dias (evento_id, data);

-- Mesmo padrão das tabelas novas: o acesso é só pelo servidor (service role).
alter table funcionario_dias enable row level security;
