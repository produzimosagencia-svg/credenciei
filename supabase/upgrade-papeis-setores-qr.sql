-- ============================================================
-- UPGRADE: setores, papéis (supervisor/gerente), QR com validade
-- e registros de conferência.
--
-- Rodar no SQL Editor do Supabase (dashboard), DEPOIS de já ter
-- rodado create-perfis-schema.sql. Idempotente.
-- ============================================================

-- 1) Setores/equipes de cada evento
create table if not exists setores (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid references eventos(id) on delete cascade,
  nome       text not null,
  created_at timestamptz default now()
);
create index if not exists setores_evento_idx on setores(evento_id);
alter table setores disable row level security;

-- 2) Funcionário: vínculo com setor + validade do QR (24h renováveis)
alter table funcionarios add column if not exists setor_id uuid references setores(id) on delete set null;
alter table funcionarios add column if not exists qr_expira_em timestamptz default (now() + interval '24 hours');
-- Funcionários antigos (criados antes desta coluna) ganham validade a partir de agora
update funcionarios set qr_expira_em = now() + interval '24 hours' where qr_expira_em is null;

-- 3) Registros: terceiro tipo "conferencia" (checagem aleatória durante o evento)
alter table registros drop constraint if exists registros_tipo_check;
alter table registros add constraint registros_tipo_check check (tipo in ('entrada', 'saida', 'conferencia'));

-- 4) Vínculo supervisor ↔ eventos (supervisor só escaneia eventos vinculados)
create table if not exists supervisor_eventos (
  perfil_id  uuid references perfis(id) on delete cascade,
  evento_id  uuid references eventos(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (perfil_id, evento_id)
);
alter table supervisor_eventos disable row level security;

-- 5) Papéis aceitos em perfis.role: admin | gerente | supervisor | cliente
--    (a coluna é text sem constraint; adicionamos o check para segurança)
alter table perfis drop constraint if exists perfis_role_check;
alter table perfis add constraint perfis_role_check check (role in ('admin', 'gerente', 'supervisor', 'cliente'));
