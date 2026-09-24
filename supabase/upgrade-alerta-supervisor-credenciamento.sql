-- ════════════════════════════════════════════════════════════════════════════
-- Aviso ao supervisor: credenciamento pendente contando os dias pro evento
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Só estende o CHECK de `mensagens_agendadas.tipo` —
-- mesmo procedimento de upgrade-aprovacao-credenciamento.sql, que já tinha
-- acrescentado 'credenciamento_negado' mas ainda não este.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'reforco_entrada', 'reforco_meio', 'reforco_fim',
    'credenciais_supervisor', 'confirmacao_escala', 'aviso_dia_evento',
    'boas_vindas_funcionario', 'aviso_montagem', 'aviso_desmontagem',
    'disparo_manual', 'veiculo_cadastrado', 'credenciamento_negado',
    'alerta_supervisor_credenciamento'
  ));

commit;

-- ROLLBACK
--   begin;
--     alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
--     alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
--       check (tipo in (
--         'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
--         'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
--         'reforco_entrada', 'reforco_meio', 'reforco_fim',
--         'credenciais_supervisor', 'confirmacao_escala', 'aviso_dia_evento',
--         'boas_vindas_funcionario', 'aviso_montagem', 'aviso_desmontagem',
--         'disparo_manual', 'veiculo_cadastrado', 'credenciamento_negado'
--       ));
--   commit;
