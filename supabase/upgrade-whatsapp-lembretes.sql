-- ============================================================
-- UPGRADE: lembretes automáticos via WhatsApp (Evolution API)
--
-- Fila de mensagens agendadas para os funcionários vinculados a um evento,
-- disparadas com antecedência das janelas de presença já existentes em
-- eventos.janela_*. Processada por um worker externo (fora do Next.js/
-- Vercel, rodando 24/7 numa VPS própria) que consome esta fila via service
-- role. Sem funções/triggers no banco — mesma linha do resto do projeto,
-- onde toda regra de negócio vive em lib/actions.ts via supabase-js.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

create table if not exists mensagens_agendadas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos(id) on delete cascade,
  funcionario_id uuid not null references funcionarios(id) on delete cascade,
  tipo text not null check (tipo in ('lembrete_entrada', 'lembrete_meio', 'lembrete_fim')),
  agendado_para timestamptz not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'cancelado')),
  tentativas int not null default 0,
  max_tentativas int not null default 3,
  proxima_tentativa timestamptz,
  telefone text not null,
  mensagem text not null,
  evolution_message_id text,
  erro text,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (evento_id, funcionario_id, tipo)
);

-- Índice principal: é exatamente o filtro usado pelo worker pra achar o que está devido.
create index if not exists mensagens_agendadas_fila_idx on mensagens_agendadas(status, agendado_para);
create index if not exists mensagens_agendadas_evento_idx on mensagens_agendadas(evento_id);

-- Log de auditoria: uma linha por TENTATIVA (não por mensagem), nunca sobrescrito.
create table if not exists mensagens_log (
  id uuid primary key default gen_random_uuid(),
  mensagem_agendada_id uuid not null references mensagens_agendadas(id) on delete cascade,
  tentativa int not null,
  status text not null check (status in ('sucesso', 'erro')),
  status_http int,
  resposta_evolution jsonb,
  erro text,
  criado_em timestamptz not null default now()
);

create index if not exists mensagens_log_agendada_idx on mensagens_log(mensagem_agendada_id);

-- RLS lockdown, mesma política do resto do banco: sem policies pra anon/authenticated,
-- só a service role (Next.js + worker) acessa.
alter table mensagens_agendadas enable row level security;
alter table mensagens_log enable row level security;
