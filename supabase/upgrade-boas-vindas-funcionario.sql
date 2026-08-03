-- ============================================================
-- UPGRADE: mensagem de boas-vindas ao funcionário
--
-- Novo tipo de mensagem, disparado assim que a pessoa se cadastra (pelo
-- formulário público ou pelo supervisor): manda o link da credencial e
-- explica as três etapas — é o tutorial do sistema traduzido pro WhatsApp,
-- pra quem não abre o link na hora.
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
    'aviso_dia_evento',
    'boas_vindas_funcionario'
  ));
