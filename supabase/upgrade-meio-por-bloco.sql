-- ════════════════════════════════════════════════════════════════════════════
-- Meio por BLOCO de trabalho — quem sai e volta no mesmo dia bate o meio de novo
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Pedido do Juan (12/10/2026): "um setor que pede batida
-- de meio: a pessoa credencia, bate meio, descredencia e volta no mesmo dia para
-- trabalhar de novo — quando ela voltar, precisa pedir o meio também".
--
-- O banco guarda UM meio por pessoa por dia (`registros_unico_por_dia`). Na volta
-- depois de uma pausa de pelo menos 30 minutos, o meio do bloco que acabou passa
-- para a PAUSA (`pausas_turno.meio_em` e a linha inteira em `meio_registro`) — ele
-- continua no histórico e no relatório — e o bloco novo pede o próprio meio,
-- contado 4 horas a partir da volta.
--
-- Sem esta migração, nada muda: o meio do dia continua sendo um só.
--
-- Rode no SQL Editor do Supabase (uma vez). Pode rodar de novo sem problema.

alter table pausas_turno
  add column if not exists meio_em timestamptz,
  add column if not exists meio_registro jsonb;

comment on column pausas_turno.meio_em is
  'O meio do bloco de trabalho que terminou nesta pausa (o bloco seguinte pede o próprio meio).';
comment on column pausas_turno.meio_registro is
  'A linha inteira de registros desse meio, como estava — nada se perde ao abrir o bloco novo.';

notify pgrst, 'reload schema';

-- Reverter (os meios guardados aqui voltam a valer só como histórico):
--     alter table pausas_turno drop column if exists meio_registro, drop column if exists meio_em;
