-- ============================================================
-- REPARO — desfaz alterações aplicadas por engano em 31/07/2026
--
-- CONTEXTO: migrações foram escritas contra uma cópia ANTIGA do projeto
-- (Documents/CRM/credenciei, parada no commit 27050b7) e rodadas neste
-- Supabase, que é o mesmo do projeto real (C:\Dev\credenciei, em produção).
-- Três coisas quebraram o sistema em produção:
--
--   1. eventos.janela_entrada/meio/fim_* foram renomeadas para
--      janela_credenciamento/checkin/descredenciamento_*  → 60 usos no código
--   2. registros.tipo teve os valores trocados entrada/meio/fim →
--      credenciamento/checkin/descredenciamento            → 99 usos no código
--   3. mensagens_agendadas e mensagens_log foram DROPADAS. Elas são deste
--      projeto (fila e log do WhatsApp), não do sistema financeiro.
--
-- Este script desfaz 1 e 2 e recria as tabelas de 3. Os DADOS de
-- mensagens_agendadas (41 linhas) e mensagens_log (121 linhas) voltam pelo
-- script Node do backup — rodar DEPOIS deste SQL.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- ─── 1) Devolve os nomes originais das janelas ──────────────────────────────
do $$
declare par record;
begin
  for par in
    select * from (values
      ('janela_credenciamento_inicio',    'janela_entrada_inicio'),
      ('janela_credenciamento_fim',       'janela_entrada_fim'),
      ('janela_checkin_inicio',           'janela_meio_inicio'),
      ('janela_checkin_fim',              'janela_meio_fim'),
      ('janela_descredenciamento_inicio', 'janela_fim_inicio'),
      ('janela_descredenciamento_fim',    'janela_fim_fim')
    ) as t(atual, original)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'eventos' and column_name = par.atual
    ) then
      execute format('alter table eventos rename column %I to %I', par.atual, par.original);
    end if;
  end loop;
end $$;

-- ─── 2) Devolve os valores originais de registros.tipo ──────────────────────
alter table registros drop constraint if exists registros_tipo_check;

update registros set tipo = case tipo
  when 'credenciamento'     then 'entrada'
  when 'checkin'            then 'meio'
  when 'descredenciamento'  then 'fim'
  else tipo
end
where tipo in ('credenciamento', 'checkin', 'descredenciamento');

alter table registros add constraint registros_tipo_check
  check (tipo in ('entrada', 'meio', 'fim'));

-- ─── 3) Recria a fila e o log do WhatsApp ───────────────────────────────────
-- Estrutura consolidada de upgrade-whatsapp-lembretes.sql + fase2 + fase3
-- + upgrade-mensagens-log-completo.sql.

create table if not exists mensagens_agendadas (
  id                  uuid primary key default gen_random_uuid(),
  evento_id           uuid not null references eventos(id) on delete cascade,
  funcionario_id      uuid references funcionarios(id) on delete cascade,
  perfil_id           uuid references perfis(id) on delete cascade,
  tipo                text not null,
  condicao            text,
  agendado_para       timestamptz not null,
  status              text not null default 'pendente'
                        check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'cancelado')),
  tentativas          int not null default 0,
  max_tentativas      int not null default 3,
  proxima_tentativa   timestamptz,
  telefone            text not null,
  mensagem            text not null,
  evolution_message_id text,
  erro                text,
  enviado_em          timestamptz,
  created_at          timestamptz not null default now(),
  unique (evento_id, funcionario_id, tipo)
);

alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'reforco_entrada', 'reforco_meio', 'reforco_fim',
    'credenciais_supervisor'
  ));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mensagens_agendadas_perfil_tipo_key'
  ) then
    alter table mensagens_agendadas add constraint mensagens_agendadas_perfil_tipo_key
      unique (perfil_id, tipo);
  end if;
end $$;

create index if not exists mensagens_agendadas_fila_idx   on mensagens_agendadas(status, agendado_para);
create index if not exists mensagens_agendadas_evento_idx on mensagens_agendadas(evento_id);
create index if not exists mensagens_agendadas_perfil_idx on mensagens_agendadas(perfil_id);

create table if not exists mensagens_log (
  id                   uuid primary key default gen_random_uuid(),
  mensagem_agendada_id uuid not null references mensagens_agendadas(id) on delete cascade,
  tentativa            int not null,
  status               text not null check (status in ('sucesso', 'erro')),
  status_http          int,
  resposta_evolution   jsonb,
  erro                 text,
  destinatario_telefone text,
  tipo                 text,
  criado_em            timestamptz not null default now()
);

create index if not exists mensagens_log_agendada_idx on mensagens_log(mensagem_agendada_id);

alter table mensagens_agendadas enable row level security;
alter table mensagens_log       enable row level security;

-- ─── 4) Remove o que foi criado por engano e nada usa ───────────────────────
-- A base central de CPF já existe neste projeto, feita sobre `funcionarios`
-- (commit 267d03a). As tabelas abaixo eram uma segunda implementação, órfã.
drop table if exists pessoas_consultas   cascade;
drop table if exists pessoa_organizacoes cascade;
drop table if exists pessoas             cascade;
drop function if exists normalizar_nome(text);

alter table setores drop column if exists checkin_sorteado_em;
alter table setores drop column if exists checkin_duracao_min;
alter table setores drop column if exists checkin_sorteado_at;

-- ─── Conferência ────────────────────────────────────────────────────────────
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
