-- ============================================================
-- UPGRADE: presença por FOTO + GPS (substitui o QR)
--
-- O funcionário se cadastra sozinho (nome, CPF, telefone, empresa) e a
-- credencial dele vira uma tela de check-in: 3 registros durante o evento
-- (entrada / meio / fim), cada um com FOTO e LOCALIZAÇÃO (GPS obrigatório),
-- dentro das janelas de horário que o admin define no evento.
--
-- Rodar no SQL Editor do Supabase, DEPOIS de:
--   1) upgrade-papeis-setores-qr.sql
--   2) upgrade-multi-organizacao.sql
--   3) upgrade-rls-lockdown.sql
-- Idempotente.
-- ============================================================

-- 1) Janelas de horário do evento (definidas pelo admin)
alter table eventos add column if not exists janela_entrada_inicio timestamptz;
alter table eventos add column if not exists janela_entrada_fim    timestamptz;
alter table eventos add column if not exists janela_meio_inicio    timestamptz;
alter table eventos add column if not exists janela_meio_fim       timestamptz;
alter table eventos add column if not exists janela_fim_inicio     timestamptz;
alter table eventos add column if not exists janela_fim_fim        timestamptz;

-- 2) Registros viram check-in por foto (entrada/meio/fim) com GPS
alter table registros add column if not exists foto_url  text;
alter table registros add column if not exists latitude  double precision;
alter table registros add column if not exists longitude double precision;

-- Remove registros antigos incompatíveis (QR: saída/conferência) antes do novo check
delete from registros where tipo not in ('entrada', 'meio', 'fim');

alter table registros drop constraint if exists registros_tipo_check;
alter table registros add constraint registros_tipo_check check (tipo in ('entrada', 'meio', 'fim'));

-- 3) Formulário curto: email e cargo deixam de ser obrigatórios
alter table funcionarios alter column email drop not null;
alter table funcionarios alter column cargo drop not null;

-- 4) Bucket privado para as fotos de presença (acesso só pela service role no servidor)
insert into storage.buckets (id, name, public)
values ('presencas', 'presencas', false)
on conflict (id) do nothing;
