-- ============================================================
-- UPGRADE: dashboard do supervisor (por setor)
--
-- Adiciona: avatar do funcionário, autor (supervisor) do registro de QR, e
-- endereço aproximado (geocoding reverso) do check-in de "meio" com GPS.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- Avatar do funcionário: caminho no bucket privado "presencas" (prefixo
-- avatares/), assinado sob demanda — mesmo padrão de funcionarios.foto_url
-- em registros.
alter table funcionarios add column if not exists foto_perfil_path text;

-- Quem fez o registro por QR (entrada/saída) — só supervisores, o registro
-- de "meio" é autocadastro anônimo do próprio funcionário e fica null aqui.
alter table registros add column if not exists criado_por_perfil_id uuid references perfis(id);

-- Endereço aproximado (reverse geocoding via Nominatim), preenchido em
-- background só para registros com lat/lng (a etapa "meio").
alter table registros add column if not exists endereco_aproximado text;
