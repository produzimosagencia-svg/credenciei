-- ============================================================
-- Jornadas recorrentes ("despertador")
--
-- Até aqui um evento tinha UMA janela por etapa (janela_entrada_inicio/fim
-- etc.), o que só funciona para evento de um dia. Para uma operação de 30
-- dias, o responsável teria que reconfigurar tudo diariamente — e, pior, o
-- registro do dia 2 sobrescrevia o do dia 1 (ver `registros.data_ref` abaixo).
--
-- Modelo em duas camadas, igual a um despertador:
--   evento_jornadas → a REGRA ("seg a sex, 08:00 e 18:00, de 01/09 a 30/09")
--   jornada_dias    → cada TOQUE, um por data, com os instantes já resolvidos
--
-- Materializar os dias (em vez de calcular a regra na hora) é o que permite
-- cancelar um dia específico, mudar o horário de um feriado e agendar
-- WhatsApp por ocorrência. A regra sozinha não tem onde guardar exceção.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- ─── A regra ─────────────────────────────────────────────────────────────────
create table if not exists evento_jornadas (
  id           uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references eventos(id) on delete cascade,
  data_inicio  date not null,
  data_fim     date not null,
  -- Minutos de folga além da janela. 0 = janela exata (comportamento atual).
  tolerancia_min int not null default 0,
  /*
   * Blocos de horário, em JSON:
   *   [{ "dias": [1,2,3,4,5], "turnos": [{ "entrada": "08:00", "saida": "18:00" }] }]
   * `dias` segue getDay() do JS: 0=domingo … 6=sábado.
   *
   * JSON e não uma terceira tabela porque isto é editado como um bloco só na
   * tela (o formulário inteiro vai e volta junto) e nunca é consultado por
   * pedaço — quem as consultas leem é `jornada_dias`, que já vem resolvido.
   */
  blocos       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- Uma jornada por evento: duas regras concorrentes não têm desempate óbvio.
  unique (evento_id)
);
alter table evento_jornadas enable row level security;

-- ─── Cada dia gerado ─────────────────────────────────────────────────────────
create table if not exists jornada_dias (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references eventos(id) on delete cascade,
  jornada_id     uuid not null references evento_jornadas(id) on delete cascade,
  data           date not null,
  -- Mais de um turno no mesmo dia (manhã e noite) → 0, 1, 2…
  turno          int  not null default 0,
  entrada_inicio timestamptz not null,
  entrada_fim    timestamptz not null,
  saida_inicio   timestamptz not null,
  saida_fim      timestamptz not null,
  -- Dia desmarcado pelo responsável (feriado, cancelamento) sem apagar a linha.
  cancelado      boolean not null default false,
  unique (evento_id, data, turno)
);
alter table jornada_dias enable row level security;

create index if not exists jornada_dias_evento_data_idx on jornada_dias (evento_id, data);
-- Índice da pergunta mais quente do sistema: "qual janela está aberta agora?"
create index if not exists jornada_dias_janela_idx on jornada_dias (evento_id, entrada_inicio, saida_fim);

-- ─── Registro passa a ser por DIA ────────────────────────────────────────────
/*
 * Sem isto a funcionalidade não existe: `upsertRegistro` apaga e reinsere por
 * (funcionario, evento, tipo), então a entrada do dia 2 apagaria a do dia 1 e
 * o evento inteiro teria uma única batida por pessoa.
 *
 * `data_ref` é o dia DA JORNADA a que o registro pertence — não a data do
 * relógio. Numa virada de madrugada (entra 22:00 do dia 5, sai 04:00 do dia
 * 6), a saída continua pertencendo ao dia 5, que é como a operação conta.
 */
alter table registros add column if not exists data_ref date;
alter table registros add column if not exists jornada_dia_id uuid references jornada_dias(id) on delete set null;

-- Backfill: tudo que existe é de evento de um dia só. A data de referência
-- passa a ser a data de início do evento, que é como esses registros sempre
-- foram lidos.
update registros r
   set data_ref = (e.data_inicio at time zone 'America/Sao_Paulo')::date
  from eventos e
 where e.id = r.evento_id
   and r.data_ref is null;

-- Um registro por pessoa/etapa/dia. É a trava que substitui o delete+insert.
create unique index if not exists registros_unico_por_dia
  on registros (funcionario_id, evento_id, tipo, data_ref);
