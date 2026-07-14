-- ============================================================
-- UPGRADE: mensagem de reforço ao funcionário (fase 3)
--
-- Roda DEPOIS de upgrade-whatsapp-mensagens-fase2.sql. Adiciona os tipos
-- reforco_entrada/meio/fim — aviso condicional ao PRÓPRIO funcionário,
-- 3 minutos antes do horário limite (janela_X_fim), só se ele ainda não
-- tiver batido o ponto daquela etapa. Mesma condição "sem_registro" já
-- usada pelos alerta_supervisor_*.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'reforco_entrada', 'reforco_meio', 'reforco_fim',
    'credenciais_supervisor'
  ));
