-- ════════════════════════════════════════════════════════════════════════════
-- Horários do aviso do meio para o supervisor (Editar evento)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Pedido do Juan (10/10/2026, VITAL): "configurar horário
-- que o supervisor recebe o aviso do meio" — e chegar DUAS vezes (VITAL: 21:00
-- e 00:00).
--
-- Em cada dia principal, em cada horário, o supervisor recebe quantos da equipe
-- dele já deveriam ter batido o meio (a janela do meio da pessoa já abriu:
-- entrada + 4h) e não bateram — a lista é montada na hora do envio. Horário
-- antes da abertura da entrada = madrugada seguinte (00:00 = meia-noite depois
-- do dia). Sem horário = o padrão: um aviso, 6h depois do fim da janela de entrada.
--
-- Rode no SQL Editor do Supabase (uma vez):

begin;

alter table eventos
  add column if not exists aviso_meio_supervisor_hora time,
  add column if not exists aviso_meio_supervisor_hora_2 time;

comment on column eventos.aviso_meio_supervisor_hora is
  '1º aviso ao supervisor de quem não bateu o meio (Brasília), em cada dia principal. null = 6h depois do fim da janela de entrada.';
comment on column eventos.aviso_meio_supervisor_hora_2 is
  '2º aviso (opcional), mesma regra. null = só um aviso.';

-- O 2º aviso é outro tipo de mensagem (a fila guarda um por supervisor, tipo e dia).
alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'alerta_supervisor_meio_2',
    'reforco_entrada', 'reforco_meio', 'reforco_fim',
    'credenciais_supervisor', 'confirmacao_escala', 'aviso_dia_evento',
    'boas_vindas_funcionario', 'aviso_montagem', 'aviso_desmontagem',
    'disparo_manual', 'veiculo_cadastrado', 'credenciamento_negado',
    'alerta_supervisor_credenciamento'
  ));

commit;

-- Reverter:
--     begin;
--     delete from mensagens_agendadas where tipo = 'alerta_supervisor_meio_2';
--     alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
--     (recriar o check sem 'alerta_supervisor_meio_2' — ver upgrade-alerta-supervisor-credenciamento.sql)
--     alter table eventos drop column if exists aviso_meio_supervisor_hora_2, drop column if exists aviso_meio_supervisor_hora;
--     commit;
