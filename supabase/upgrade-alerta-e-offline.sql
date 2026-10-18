-- ═══════════════════════════════════════════════════════════════════════════
-- A MARCA NA BATIDA (18/10/2026)
--
-- O portão não barra mais por escala nem por limite de pessoas do dia (Juan: "esses ajustes que a gente fez no
-- VITAL não podem prejudicar o sistema… o sistema é simples, não pode estar acontecendo esses entraves"). A batida
-- entra e fica marcada aqui, para o supervisor e o fechamento conferirem:
--
--   fora_da_escala   — o dia não está entre os dias aprovados da pessoa
--   escala_pendente  — a escala da pessoa ainda não foi aprovada
--   acima_do_limite  — a equipe já tinha batido o limite de pessoas do dia
--
-- Vários ao mesmo tempo vão separados por vírgula ("fora_da_escala,acima_do_limite").
--
-- A batida feita SEM INTERNET (guardada no aparelho do portão e enviada depois) usa a coluna que já existe,
-- `recebido_em`: `created_at` é a hora em que foi lida, `recebido_em` a hora em que chegou ao servidor.
--
-- Pode rodar quantas vezes quiser. Antes de rodar, o sistema já funciona: a marca vai no fim da justificativa.
-- ═══════════════════════════════════════════════════════════════════════════

alter table registros add column if not exists alerta text;
alter table registros add column if not exists recebido_em timestamptz;

comment on column registros.alerta is
  'Batida que entrou com aviso (o portão não barra mais): fora_da_escala, escala_pendente, acima_do_limite — separados por vírgula.';
comment on column registros.recebido_em is
  'Quando a batida chegou ao servidor. Diferente de created_at = feita sem internet e enviada depois pelo aparelho.';

-- O PostgREST passa a enxergar a coluna nova na hora.
notify pgrst, 'reload schema';
