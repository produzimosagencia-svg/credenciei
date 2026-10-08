-- ════════════════════════════════════════════════════════════════════════════
-- Batida do meio em dia de MONTAGEM/DESMONTAGEM: só quando ligada de propósito
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Uma coluna em `jornada_dias`, desligada por padrão.
--
-- Regra do Juan (08/10/2026): montagem e desmontagem NÃO pedem o meio — só os
-- dias do evento. Mas quem quiser pode ligar o meio num dia de montagem ou
-- desmontagem, em Editar evento → Batida do meio.
--
-- Por que uma coluna nova e não `exige_meio`: `exige_meio` nasce LIGADA em todo
-- dia (é o padrão para os dias do evento), e por isso não dá para saber se um dia
-- de montagem foi ligado de propósito ou só ficou com o padrão. Esta nasce
-- DESLIGADA: só fica ligada quando alguém marca o dia na tela.
--
-- Sem rodar este arquivo, montagem e desmontagem simplesmente não pedem o meio
-- (o comportamento novo); rodar é o que permite LIGAR em algum desses dias.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table jornada_dias
  add column if not exists meio_fora_do_evento boolean not null default false;

comment on column jornada_dias.meio_fora_do_evento is
  'Só para dia de montagem/desmontagem (tipo <> principal): true = este dia pede a batida do meio. Padrão: não pede.';

-- ROLLBACK
--   alter table jornada_dias drop column if exists meio_fora_do_evento;
