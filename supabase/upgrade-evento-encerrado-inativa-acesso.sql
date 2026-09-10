-- ════════════════════════════════════════════════════════════════════════════
-- Evento encerrado → acessos daquele evento ficam inativos (e voltam ao reativar)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Uma coluna nova em `perfis`. Nada existente muda.
--
-- POR QUE UMA MARCA, E NÃO SÓ `ativo = false`
--
-- Encerrar um evento passa a inativar os acessos criados PARA ele — supervisor
-- de um setor do evento, e suporte cujo escopo é só esse evento. Mas o admin
-- também inativa gente na mão (3 pontinhos → Inativar). Se o "reativar evento"
-- simplesmente religasse todo mundo, religaria também quem foi desligado de
-- propósito.
--
-- `inativado_em_evento` guarda QUE evento apagou aquele acesso. Reativar o
-- evento religa exatamente quem tem essa marca — e ninguém mais. Ativar/inativar
-- manualmente limpa a marca (não é mais "do evento").
--
-- FICA DE FORA: operador de portão. Ele é da ORGANIZAÇÃO, não de um evento
-- (cobre vários eventos do mesmo cliente) — o dado não diz "criado no evento X",
-- e inativá-lo ao encerrar um evento derrubaria o acesso dele nos outros.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table perfis
  add column if not exists inativado_em_evento uuid references eventos(id) on delete set null;

-- A consulta do "reativar": religar quem este evento inativou.
create index if not exists perfis_inativado_em_evento
  on perfis (inativado_em_evento)
  where inativado_em_evento is not null;

commit;

-- ROLLBACK
--   begin;
--     drop index if exists perfis_inativado_em_evento;
--     alter table perfis drop column if exists inativado_em_evento;
--   commit;
