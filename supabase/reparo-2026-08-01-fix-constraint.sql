-- ============================================================
-- FIX — reparo-2026-08-01.sql recriou mensagens_agendadas com a constraint
-- de `tipo` faltando 'confirmacao_escala' (adicionado depois da fase 3,
-- upgrade-feedback-cliente.sql, e não estava no snapshot usado no reparo).
-- Também adiciona 'aviso_dia_evento' (novo tipo — aviso 2h antes do
-- credenciamento, pedido no documento de escopo do cliente).
--
-- Sem isso, sincronizarAgendamentos() falha silenciosamente pra QUALQUER
-- evento que tenha msg_pre_evento_envio preenchido: o upsert insere todas
-- as linhas do funcionário numa única instrução — lembrete_entrada,
-- reforco_entrada, confirmacao_escala etc juntos — e uma linha inválida
-- derruba a instrução inteira, cancelando também lembrete e reforço desse
-- funcionário, não só a confirmação de escala.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'reforco_entrada', 'reforco_meio', 'reforco_fim',
    'credenciais_supervisor',
    'confirmacao_escala',
    'aviso_dia_evento'
  ));
