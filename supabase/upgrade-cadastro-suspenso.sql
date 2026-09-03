-- ════════════════════════════════════════════════════════════════════════════
-- Suspender o cadastro por link de um evento
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente muda de forma.
--
-- POR QUE
--
-- Pedido de 03/09/2026 (Henrique e Juliano - Kleber Andrade): a lista fechou,
-- mas os links de cadastro dos setores continuam circulando em grupo de
-- WhatsApp e gente nova segue entrando. Encerrar o evento não serve — ele
-- ainda vai acontecer e a portaria precisa bater ponto. Trocar o link de
-- cada um dos 43 setores também não: é trabalho manual e quem já tem o link
-- novo repassa de novo.
--
-- Um interruptor por evento resolve: com `cadastro_suspenso = true`, todo
-- formulário /form/<token> do evento e o cartaz da portaria mostram "cadastro
-- encerrado" e a action recusa — sem mexer em setor, link ou quem já está
-- dentro. Desligar reabre tudo na hora.
--
-- Rode no SQL Editor do Supabase (uma vez):

alter table eventos
  add column if not exists cadastro_suspenso boolean not null default false;

comment on column eventos.cadastro_suspenso is
  'true = os links de cadastro dos setores e o cartaz da portaria recusam cadastro novo. Quem já está dentro não é afetado.';

-- Reverter:
--     alter table eventos drop column if exists cadastro_suspenso;
