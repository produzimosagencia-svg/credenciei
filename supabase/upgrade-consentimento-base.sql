-- ============================================================
-- Consentimento para a base regional
--
-- A pessoa autoriza, no formulário público, que os dados dela fiquem na base
-- do Credenciei e possam ser vistos por outros organizadores. Sem isso, usar
-- o cadastro dela para recrutamento é uma finalidade diferente da que ela
-- aceitou ao se inscrever para trabalhar num evento específico.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- Default FALSE de propósito: quem já está na base cadastrou antes desta tela
-- existir e nunca foi perguntado. Marcar todo mundo como consentido seria
-- inventar um "sim" que ninguém deu.
alter table funcionarios add column if not exists consentimento_base boolean not null default false;

-- QUANDO foi dado. É o que torna o consentimento demonstrável: um booleano
-- sozinho não responde "desde quando" nem "sob qual versão do texto".
alter table funcionarios add column if not exists consentimento_em timestamptz;

-- Índice do filtro da busca regional: a tela lista quem autorizou.
create index if not exists funcionarios_consentimento_idx
  on funcionarios (consentimento_base) where consentimento_base;
