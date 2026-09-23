-- ════════════════════════════════════════════════════════════════════════════
-- Mensagem de confirmação de cadastro de veículo (WhatsApp)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível.
--
-- `mensagens_agendadas.tipo` tem um CHECK que precisa listar cada tipo
-- (histórico: upgrade-whatsapp-lembretes.sql → ...-fase2 → ...-fase3 →
-- upgrade-avisos-por-fase.sql → upgrade-painel-whatsapp.sql). Sem atualizar
-- aqui, um insert com tipo 'veiculo_cadastrado' seria recusado pelo banco na
-- hora, não só no código. A lista abaixo é a união de tudo que essas
-- migrações já permitiram — nada é removido, só some 'veiculo_cadastrado'.
--
-- `veiculo_id`: a mensagem de cadastro de veículo não tem `funcionario_id`
-- nem `perfil_id` pra apontar (o condutor pode nem ser da equipe) — precisa
-- do próprio veículo. Mesmo padrão de quando `perfil_id` foi adicionado
-- (upgrade-whatsapp-mensagens-fase2.sql): coluna nova nullable + unique
-- (veiculo_id, tipo) pra dedupe, sem mexer nas constraints que já existem
-- pra funcionario_id/perfil_id (NULL nunca conflita com NULL em UNIQUE do
-- Postgres, então as linhas antigas não são afetadas).
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table mensagens_agendadas
  add column if not exists veiculo_id uuid references veiculos(id) on delete cascade;

create index if not exists mensagens_agendadas_veiculo_idx on mensagens_agendadas(veiculo_id);
create unique index if not exists mensagens_agendadas_veiculo_tipo_key
  on mensagens_agendadas (veiculo_id, tipo);

alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'reforco_entrada', 'reforco_meio', 'reforco_fim',
    'credenciais_supervisor', 'confirmacao_escala', 'aviso_dia_evento',
    'boas_vindas_funcionario', 'aviso_montagem', 'aviso_desmontagem',
    'disparo_manual', 'veiculo_cadastrado'
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
--         'disparo_manual'
--       ));
--     drop index if exists mensagens_agendadas_veiculo_tipo_key;
--     alter table mensagens_agendadas drop column if exists veiculo_id;
--   commit;
