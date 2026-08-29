-- ============================================================
-- O campo "empresa" deixa de ser pedido no cadastro
--
-- A pessoa se cadastra pelo link do SETOR — e o setor já diz onde ela vai
-- trabalhar. Pedir a empresa de novo era pedir duas vezes a mesma coisa, com
-- a diferença de que a segunda vinha digitada à mão e virava variação: a
-- mesma equipe aparecia com três grafias.
--
-- A coluna NÃO é apagada: os cadastros que já existem têm o dado preenchido, e
-- jogar fora esse histórico não traz ganho nenhum. Ela só deixa de ser
-- obrigatória — sem isto, todo cadastro novo passa a falhar no banco.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table funcionarios alter column empresa drop not null;
