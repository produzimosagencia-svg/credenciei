-- ════════════════════════════════════════════════════════════════════════════
-- Mesma função em MAIS DE UMA organização (07/10/2026)
--
-- O caso: o Juan é Gestor de credenciamento (operador de portão) na Navista e quis ser
-- também na Homologação. A tabela `perfil_funcoes` tinha `unique (perfil_id, role)` —
-- uma função por tipo —, então o segundo cadastro "dava certo" na tela, mandava a
-- mensagem, e nada era gravado: a pessoa nunca aparecia na lista do evento.
--
-- Agora a chave é (pessoa, função, organização): dá pra ser operador em duas organizações,
-- e a pessoa escolhe qual usa em "Trocar de perfil" (Gestor de credenciamento · Navista /
-- Gestor de credenciamento · Homologação).
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table perfil_funcoes drop constraint if exists perfil_funcoes_perfil_id_role_key;

-- `coalesce` porque o Encarregado não tem organização (NULL) e NULLs nunca colidem num unique comum.
create unique index if not exists perfil_funcoes_pessoa_funcao_org
  on perfil_funcoes (perfil_id, role, coalesce(organizacao_id, '00000000-0000-0000-0000-000000000000'::uuid));

commit;
