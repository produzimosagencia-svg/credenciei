-- ============================================================
-- Avisos por fase da operação
--
-- Um evento tem três fases e a equipe precisa ouvir coisas diferentes em cada
-- uma: montagem (antes), o dia do evento, desmontagem (depois). Até aqui só
-- existia mensagem para o dia do evento — nos dias de preparação a equipe não
-- recebia nada, porque esses dias não têm horário e todo agendamento partia de
-- um horário.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'reforco_entrada', 'reforco_meio', 'reforco_fim',
    'credenciais_supervisor', 'confirmacao_escala', 'aviso_dia_evento',
    'boas_vindas_funcionario',
    -- Aviso diário das fases de preparação.
    'aviso_montagem', 'aviso_desmontagem'
  ));
