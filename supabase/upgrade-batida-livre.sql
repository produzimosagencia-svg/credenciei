-- ════════════════════════════════════════════════════════════════════════════
-- Batida livre no dia do evento
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e reversível. Nenhuma tela existente lê esta coluna, e o valor padrão
-- (false) faz todos os eventos de hoje continuarem se comportando igual.
--
-- ─── O PROBLEMA ─────────────────────────────────────────────────────────────
--
-- No dia do evento, entrada e saída obedecem a uma janela de horário. Funciona
-- para operação que entra junto: portaria abre, a equipe chega, credencia.
--
-- Não funciona para show grande com escala rotativa. No Kleber Andrade a
-- equipe entra a noite inteira, em turnos, em horários que ninguém consegue
-- prever na hora de cadastrar o evento. Uma janela fixa recusaria quem chega
-- às três da manhã — e "recusado" no portão, com o show acontecendo, é o pior
-- momento possível para descobrir que o horário estava apertado.
--
-- ─── POR QUE UMA COLUNA, E NÃO APAGAR OS HORÁRIOS ───────────────────────────
--
-- Deixar as janelas nulas também libera a batida — `dentroDaJanela` já trata
-- nulo como "sem trava". Seria zero mudança de banco. Mas custa duas coisas:
--
--   1. O aviso do dia do evento PARA de ser agendado: ele depende de
--      `janela_entrada_inicio` para existir e para saber a hora de sair. As 68
--      pessoas ficariam sem a mensagem "hoje é o grande dia".
--
--   2. A intenção some. "Janelas nulas" pode ser evento configurado de
--      propósito ou evento que alguém esqueceu de configurar — e ninguém, seis
--      meses depois, sabe dizer qual foi.
--
-- Com a coluna, os horários continuam gravados como REFERÊNCIA (a mensagem
-- segue dizendo à equipe quando é esperada) e a trava é desligada
-- explicitamente. Quem abrir a tela vê uma escolha, não uma ausência.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table eventos
  add column if not exists batida_livre boolean not null default false;

comment on column eventos.batida_livre is
  'Quando true, entrada e saída do DIA DO EVENTO não respeitam janela de '
  'horário — a pessoa bate quando chega e quando sai, como já acontece nos '
  'dias de montagem. Para show com escala rotativa. Os horários configurados '
  'continuam valendo como referência nas mensagens e no relatório de atraso.';

commit;

-- ROLLBACK
--   begin;
--     alter table eventos drop column if exists batida_livre;
--   commit;
