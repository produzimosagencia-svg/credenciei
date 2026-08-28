-- ============================================================
-- Janelas por DIA + listas de pendência do supervisor
--
-- Contexto da mudança (ver lib/janelas.ts):
--   * entrada e saída ficaram LIVRES em todo dia do período do evento; só o
--     dia principal continua preso à janela configurada;
--   * o MEIO deixou de ter horário fixo e passou a ser a entrada real da
--     pessoa + 4h;
--   * cada funcionário tem uma janela por DIA, e o dia seguinte começa do zero.
--
-- O banco já suportava a maior parte disso: `registros.data_ref` e o índice
-- único (funcionario, evento, tipo, data_ref) vieram em
-- upgrade-jornadas-recorrentes.sql. O que falta é a FILA DE MENSAGENS, que
-- ainda era por evento e não por dia — hoje um supervisor só consegue receber
-- UM alerta de cada tipo no evento inteiro, então numa operação de 30 dias ele
-- seria avisado no primeiro dia e nunca mais.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- ─── A fila passa a ser por dia ──────────────────────────────────────────────
/*
 * O default '1970-01-01' é o balde das linhas que já existem: elas são todas
 * de evento de um dia só, nunca vão ser reagendadas, e mandá-las para uma data
 * sentinela mantém a unicidade delas exatamente como era. Linhas novas sempre
 * gravam o dia real.
 */
alter table mensagens_agendadas
  add column if not exists data_ref date not null default '1970-01-01';

-- Trocar constraint por índice único: o upsert do supabase-js aceita os dois,
-- e índice permite `if not exists` (constraint não).
alter table mensagens_agendadas
  drop constraint if exists mensagens_agendadas_evento_id_funcionario_id_tipo_key;
create unique index if not exists mensagens_agendadas_func_dia_key
  on mensagens_agendadas (evento_id, funcionario_id, tipo, data_ref);

alter table mensagens_agendadas
  drop constraint if exists mensagens_agendadas_perfil_tipo_key;
create unique index if not exists mensagens_agendadas_perfil_dia_key
  on mensagens_agendadas (perfil_id, tipo, data_ref);

-- Tipos novos: boas-vindas, aviso do dia e confirmação de escala já eram
-- usados pelo código mas nunca entraram no check — inserir qualquer um deles
-- falhava com violação de constraint.
alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'reforco_entrada', 'reforco_meio', 'reforco_fim',
    'credenciais_supervisor', 'confirmacao_escala', 'aviso_dia_evento',
    'boas_vindas_funcionario'
  ));

-- ─── Consulta quente das listas de pendência ─────────────────────────────────
-- `pendenciasDoDia` sempre pergunta "registros deste evento NESTE dia".
create index if not exists registros_evento_dia_idx on registros (evento_id, data_ref);
