-- ════════════════════════════════════════════════════════════════════════════
-- A confirmação do MEIO passa a ser por SETOR
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e reversível, mas MUDA COMPORTAMENTO: com o padrão `false`, todos
-- os setores existentes passam a NÃO pedir o meio até alguém ligar um a um.
-- É o pedido: o organizador liga só onde a equipe é paga por pessoa.
--
-- ─── O PEDIDO ───────────────────────────────────────────────────────────────
--
-- O meio (selfie no meio do turno) existe para comprovar que a pessoa ficou
-- no posto. Isso importa para equipe paga POR PESSOA — segurança, brigadista,
-- limpeza, carregadores, acessos, bar. Para fornecedor contratado por pacote
-- fechado, não muda pagamento nenhum: só gera mensagem de WhatsApp que
-- ninguém precisava receber, e cada mensagem é cobrada.
--
-- ─── POR QUE NO SETOR, E NÃO NO EVENTO ──────────────────────────────────────
--
-- O mesmo evento tem os dois tipos ao mesmo tempo: o Henrique e Juliano tem
-- carregadores (por pessoa, precisa do meio) e fornecedores de som/luz
-- (pacote fechado, não precisa). Um interruptor por evento obrigaria a
-- escolher entre cobrar quem não deve ou deixar de cobrar quem deve.
--
-- ─── O QUE ESTA COLUNA NÃO FAZ ──────────────────────────────────────────────
--
-- Desligar o meio NÃO apaga registro nenhum já feito. O que ela desliga é a
-- COBRANÇA: o cartão some da credencial, o lembrete e o reforço não são
-- agendados, e a pessoa deixa de aparecer na lista de pendências do meio.
-- Batida já registrada continua aparecendo no histórico e na credencial.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table fornecedores
  add column if not exists exige_meio boolean not null default false;

comment on column fornecedores.exige_meio is
  'Só quando TRUE este setor pede a confirmação do meio. Falso (o padrão) = '
  'sem cartão na credencial, sem lembrete/reforço de WhatsApp e fora da lista '
  'de pendências do meio. Nasce desligado a pedido: o meio só importa em '
  'equipe paga POR PESSOA, que é a minoria dos setores — deixar ligado por '
  'padrão cobraria (e custaria WhatsApp de) todo o resto sem necessidade.';

commit;

-- ROLLBACK
--   begin;
--     alter table fornecedores drop column if exists exige_meio;
--   commit;
