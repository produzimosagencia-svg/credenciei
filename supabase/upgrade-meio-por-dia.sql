-- ════════════════════════════════════════════════════════════════════════════
-- O MEIO passa a ter DIA, além de setor
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Com o padrão `true`, NADA muda de comportamento: quem
-- tem setor com `exige_meio` ligado continua pedindo o meio em todos os dias,
-- exatamente como hoje — até alguém desmarcar um dia na tela.
--
-- ─── O PEDIDO ───────────────────────────────────────────────────────────────
--
-- `fornecedores.exige_meio` (ver upgrade-meio-por-setor.sql) respondia "QUAIS
-- SETORES pedem o meio". Faltava "EM QUAIS DIAS" — e numa operação de onze
-- dias como o Henrique e Juliano isso é a diferença entre pedir a selfie no
-- dia que importa e pedi-la nos onze.
--
-- O custo é literal: são duas mensagens de WhatsApp por pessoa por dia
-- (lembrete + reforço), ambas cobradas. Com 630 pessoas, cada dia de meio
-- ligado sem necessidade é mais de mil mensagens.
--
-- ─── POR QUE NO DIA, E NÃO NO PAR SETOR×DIA ─────────────────────────────────
--
-- Decisão do Juan em 02/09/2026: os dias valem pro evento inteiro. O meio
-- acontece quando o SETOR está ligado E o DIA está marcado — um E lógico
-- entre duas listas curtas, em vez de uma grade de 33 setores × 11 dias que
-- ninguém preencheria na véspera do show.
--
-- ─── O QUE ESTA COLUNA NÃO FAZ ──────────────────────────────────────────────
--
-- Mesma semântica de `fornecedores.exige_meio`: desligar NÃO apaga registro
-- nenhum já feito. Desliga a COBRANÇA — o cartão some da credencial, o
-- lembrete e o reforço não são agendados, e ninguém entra na lista de
-- pendências do meio naquele dia. Batida já registrada continua no histórico
-- e na credencial.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table jornada_dias
  add column if not exists exige_meio boolean not null default true;

comment on column jornada_dias.exige_meio is
  'Este dia da operação pede a confirmação do meio? Padrão TRUE para não '
  'mudar o comportamento de nenhum evento existente ao aplicar a migração. '
  'O meio só é pedido quando ESTE dia está marcado E o setor da pessoa tem '
  '`fornecedores.exige_meio` ligado — ver upgrade-meio-por-setor.sql.';

commit;

-- ROLLBACK
--   begin;
--     alter table jornada_dias drop column if exists exige_meio;
--   commit;
