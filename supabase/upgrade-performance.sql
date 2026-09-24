-- ════════════════════════════════════════════════════════════════════════════
-- Painel de Performance — observabilidade real da plataforma
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente muda.
--
-- POR QUE CINCO TABELAS
--
-- `perf_services` é o registro central (o "ServiceMonitor" pedido pelo Juan
-- 24/09/2026) — cada linha é um serviço monitorável, com seus próprios
-- limiares e intervalo de checagem. `perf_checks` é o histórico bruto (uma
-- linha por execução de health-check) — retenção curta (30 dias, apagada
-- pelo próprio cron a cada execução, ver lib/performance.ts). `perf_uptime_diario`
-- é o agregado de longo prazo (1 linha por serviço por dia) — pequeno o
-- bastante pra guardar indefinidamente sem custo. `perf_incidents` e
-- `perf_alerts` são permanentes: são o histórico que importa depois que o
-- detalhe do check já foi descartado.
--
-- STATUS/CATEGORIA/NÍVEL SÃO TEXTO LIVRE, SEM CHECK CONSTRAINT
--
-- Mesma decisão de `orcamentos.status`/`veiculos.status`: a régua vive no
-- código (lib/performance-constantes.ts), adicionar uma categoria ou nível
-- novo não pode exigir migração de banco.
--
-- SEM DADO SENSÍVEL
--
-- Nenhuma coluna aqui guarda token, senha, CPF ou conteúdo de mensagem —
-- só metadado técnico (status, latência, erro já mascarado antes de
-- gravar — ver `mascarar()` em lib/performance-checks.ts).
--
-- RLS SEM POLICY, DE PROPÓSITO — mesmo padrão do resto do sistema. Todo
-- acesso real passa por `supabaseAdmin` no servidor, atrás de
-- `podeVerPerformance`/`podeGerenciarPerformance`.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists perf_services (
  id                 uuid primary key default gen_random_uuid(),
  chave              text not null unique,
  nome               text not null,
  tipo               text not null,
  categoria          text not null,
  descricao          text,
  ambiente           text not null default 'producao',
  endpoint           text,
  habilitado         boolean not null default true,
  intervalo_segundos integer not null default 60 check (intervalo_segundos >= 30),
  timeout_ms         integer not null default 8000,
  limiar_atencao_ms  integer not null default 1000,
  limiar_critico_ms  integer not null default 3000,
  ordem              integer not null default 0,
  falhas_consecutivas integer not null default 0,
  ultimo_check_em    timestamptz,
  -- Denormalizado do último `perf_checks` — evita join no dashboard, que lê
  -- isto a cada carregamento de tela. 'online'|'atencao'|'offline'|'nao_monitorado'.
  ultimo_status      text not null default 'nao_monitorado',
  ultima_latencia_ms integer,
  ultimo_erro        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists perf_checks (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references perf_services(id) on delete cascade,
  -- 'online' | 'atencao' | 'offline' | 'nao_monitorado'
  status       text not null,
  latencia_ms  integer,
  status_code  integer,
  erro         text,
  checado_em   timestamptz not null default now()
);

create index if not exists perf_checks_service_data on perf_checks (service_id, checado_em desc);
create index if not exists perf_checks_checado_em on perf_checks (checado_em);

create table if not exists perf_uptime_diario (
  id             uuid primary key default gen_random_uuid(),
  service_id     uuid not null references perf_services(id) on delete cascade,
  dia            date not null,
  checks_total   integer not null default 0,
  checks_ok      integer not null default 0,
  latencia_media_ms integer,
  unique (service_id, dia)
);

create index if not exists perf_uptime_diario_service on perf_uptime_diario (service_id, dia desc);

create table if not exists perf_incidents (
  id                  uuid primary key default gen_random_uuid(),
  service_id          uuid not null references perf_services(id) on delete cascade,
  -- 'warning' | 'critical'
  nivel               text not null,
  titulo              text not null,
  causa               text,
  iniciado_em         timestamptz not null default now(),
  resolvido_em        timestamptz,
  -- 'investigando' | 'ativo' | 'resolvido' | 'ignorado'
  status              text not null default 'ativo',
  falhas_consecutivas integer not null default 0,
  ultima_resposta     text,
  created_at          timestamptz not null default now()
);

create index if not exists perf_incidents_service on perf_incidents (service_id, iniciado_em desc);
create index if not exists perf_incidents_status on perf_incidents (status);

create table if not exists perf_alerts (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid references perf_incidents(id) on delete cascade,
  service_id  uuid references perf_services(id) on delete cascade,
  -- 'info' | 'warning' | 'critical'
  nivel       text not null,
  titulo      text not null,
  mensagem    text not null,
  lido_em     timestamptz,
  lido_por    uuid references perfis(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists perf_alerts_nao_lidos on perf_alerts (lido_em) where lido_em is null;
create index if not exists perf_alerts_created on perf_alerts (created_at desc);

alter table perf_services      enable row level security;
alter table perf_checks        enable row level security;
alter table perf_uptime_diario enable row level security;
alter table perf_incidents     enable row level security;
alter table perf_alerts        enable row level security;

-- ── Seed — os serviços reais já mapeados no código atual ────────────────────
-- Nenhum dado inventado: cada um corresponde a uma integração que já existe
-- em lib/ (ver FASE 1 do plano). `on conflict do nothing` pra rodar de novo
-- sem duplicar se a migração for reaplicada.
insert into perf_services (chave, nome, tipo, categoria, descricao, endpoint, intervalo_segundos, ordem) values
  ('api',                 'API Credenciei',          'api',         'aplicacao',    'A própria aplicação Next.js — se isto cair, tudo cai.', '/api/health', 60, 10),
  ('banco',               'Banco de Dados',           'database',    'infraestrutura','Supabase Postgres, via service role.', null, 60, 20),
  ('storage',             'Storage',                  'storage',     'infraestrutura','Supabase Storage — fotos, comprovantes, QR.', null, 60, 30),
  ('dominio_ssl',         'Domínio & SSL',            'dominio',     'infraestrutura','credenciei.com.br — DNS e validade do certificado.', 'https://credenciei.com.br', 300, 40),
  ('whatsapp',            'WhatsApp',                 'integracao',  'integracoes',  'Canal ativo (Meta Cloud API ou Evolution), conforme configuração.', null, 60, 50),
  ('fila_mensagens',      'Fila de mensagens',        'processo',    'processos',    'Worker da VPS + cron da Vercel processando mensagens agendadas.', null, 120, 60),
  ('gemini',              'Gemini',                   'ia',          'integracoes',  'IA usada no chat administrativo e na extração de gastos por voz.', null, 300, 70),
  ('google',              'Google Sheets/Drive',      'integracao',  'integracoes',  'Cópia das planilhas de evento pro cliente.', null, 300, 80),
  ('email',               'E-mail (Resend)',          'integracao',  'comunicacao',  'Lembrete D-1 de conferência de equipe.', null, 300, 90),
  ('conferencia_equipe',  'Cron: Conferência de equipe', 'processo', 'processos',    'Execução diária do lembrete de conferência de equipe.', null, 3600, 100)
on conflict (chave) do nothing;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists perf_alerts;
--     drop table if exists perf_incidents;
--     drop table if exists perf_uptime_diario;
--     drop table if exists perf_checks;
--     drop table if exists perf_services;
--   commit;
