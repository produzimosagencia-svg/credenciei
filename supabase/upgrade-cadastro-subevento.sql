-- ════════════════════════════════════════════════════════════════════════════
-- Travar o cadastro de novas pessoas por SUBGRUPO (subevento)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Pedido do Juan (09/10/2026, VITAL): travar o cadastro
-- só do subgrupo GERAL, com os outros abertos — no meio do caminho entre o
-- interruptor do evento inteiro (`eventos.cadastro_suspenso`) e o de cada
-- fornecedor (`fornecedores.link_ativo`). As três trancas valem juntas:
-- qualquer uma fechada basta para recusar; nenhuma vence a outra.
--
-- Rode no SQL Editor do Supabase (uma vez):

alter table subeventos
  add column if not exists cadastro_suspenso boolean not null default false;

comment on column subeventos.cadastro_suspenso is
  'true = os links de cadastro dos fornecedores deste subgrupo recusam cadastro novo. Quem já está dentro não é afetado.';

-- Reverter:
--     alter table subeventos drop column if exists cadastro_suspenso;
