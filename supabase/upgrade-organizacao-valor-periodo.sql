-- ============================================================
-- UPGRADE: periodicidade do valor cobrado por organização
--
-- valor_cobrado (já existente) passa a ter uma periodicidade associada:
-- diário, semanal, mensal ou por evento. Default 'mensal' pra manter
-- compatível com os valores já cadastrados antes desta coluna existir.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table organizacoes add column if not exists valor_cobrado_periodo text default 'mensal';

alter table organizacoes drop constraint if exists organizacoes_valor_cobrado_periodo_check;
alter table organizacoes add constraint organizacoes_valor_cobrado_periodo_check
  check (valor_cobrado_periodo in ('diario', 'semanal', 'mensal', 'evento'));

update organizacoes set valor_cobrado_periodo = 'mensal' where valor_cobrado_periodo is null;
