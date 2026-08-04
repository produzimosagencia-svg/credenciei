-- ============================================================
-- UPGRADE: registro de ponto assistido pelo supervisor
--
-- Quando alguém perde a janela de uma etapa, o supervisor localiza a pessoa
-- pelo CPF, tira uma foto dela e o sistema grava a etapa pendente. O registro
-- precisa carregar a prova de quem fez, quando, onde e com qual aparelho.
--
-- Já existiam de antes: registro_manual, criado_por_perfil_id, foto_url,
-- latitude, longitude, endereco_aproximado. Faltavam as duas abaixo.
--
-- Imutabilidade: o banco só é acessado pela service role, no servidor — não
-- existe caminho pelo navegador até estas colunas, e nenhuma tela do sistema
-- edita registro depois de criado. Por isso não há trigger de bloqueio aqui
-- (o projeto não usa function/trigger em lugar nenhum).
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- Aparelho usado pelo supervisor no momento do registro (user agent do navegador)
alter table registros add column if not exists dispositivo text;

-- Motivo do registro assistido, gravado automaticamente pelo sistema
alter table registros add column if not exists justificativa text;

-- Busca por CPF é o caminho principal da tela "Localizar Funcionário"
create index if not exists funcionarios_cpf_idx on funcionarios(cpf);
