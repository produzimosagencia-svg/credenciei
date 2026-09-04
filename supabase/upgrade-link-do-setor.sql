-- ════════════════════════════════════════════════════════════════════════════
-- Liga/desliga o link de cadastro de CADA setor, um a um
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Só acrescenta uma coluna em `fornecedores`.
--
-- POR QUE
--
-- `eventos.cadastro_suspenso` fecha o evento INTEIRO de uma vez. O caso real
-- (Juan, 04/09/2026) é mais fino: um setor já fechou a equipe e não quer mais
-- receber ninguém, enquanto os outros seguem montando. Hoje não havia meio
-- termo — ou tudo aberto, ou tudo fechado.
--
-- `link_ativo` é o interruptor DAQUELE setor, no card dele. A regra nos três
-- pontos que barram cadastro (formulário do setor, cartaz da portaria e a
-- action `cadastrarFuncionarioPublico`) vira uma frase só:
--
--     bloqueado = evento.cadastro_suspenso OR NOT fornecedor.link_ativo
--
-- Ou seja: o interruptor do evento continua mandando em todos; o do setor
-- fecha só o dele. Nenhum dos dois "vence" o outro — qualquer um dos dois
-- fechado já basta pra recusar.
--
-- Nasce `true`: todo setor que existe hoje continua exatamente como está.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table fornecedores
  add column if not exists link_ativo boolean not null default true;

comment on column fornecedores.link_ativo is
  'false = o link de cadastro DESTE setor recusa cadastro novo, mesmo com o evento aberto. Quem já está na equipe não é afetado.';

commit;

-- ROLLBACK
--   begin;
--     alter table fornecedores drop column if exists link_ativo;
--   commit;
