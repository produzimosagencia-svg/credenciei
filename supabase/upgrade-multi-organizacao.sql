-- ============================================================
-- UPGRADE: multi-organização (SaaS multi-tenant)
--
-- Introduz o conceito de ORGANIZAÇÃO (o "inquilino" do sistema).
-- Cada organização (ex: Brilha Shows, Lagoon) tem um usuário admin
-- que enxerga APENAS os dados da própria organização.
-- O usuário master (plataforma) enxerga e gerencia tudo.
--
-- Rodar no SQL Editor do Supabase (dashboard), DEPOIS de já ter
-- rodado upgrade-papeis-setores-qr.sql. Idempotente.
-- ============================================================

-- 1) Organizações (o tenant do SaaS)
create table if not exists organizacoes (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,            -- nome da empresa/organização
  documento        text,                     -- CPF ou CNPJ do responsável
  responsavel_nome text,                     -- pessoa responsável
  limite_eventos   int  not null default 1,  -- quantos eventos o admin pode criar
  ativo            boolean not null default true, -- master pode suspender o acesso
  drive_folder_id  text,                     -- pasta no Drive (planilhas da org)
  created_at       timestamptz default now()
);
alter table organizacoes disable row level security;

-- 2) Perfil pertence a uma organização (NULL = usuário master da plataforma)
alter table perfis add column if not exists organizacao_id uuid references organizacoes(id) on delete cascade;
create index if not exists perfis_organizacao_idx on perfis(organizacao_id);

-- 3) Evento pertence a uma organização
alter table eventos add column if not exists organizacao_id uuid references organizacoes(id) on delete cascade;
create index if not exists eventos_organizacao_idx on eventos(organizacao_id);

-- 4) Papel "master" passa a ser aceito em perfis.role
--    (mantemos os papéis legados no check para não quebrar linhas antigas)
alter table perfis drop constraint if exists perfis_role_check;
alter table perfis add constraint perfis_role_check
  check (role in ('master', 'admin', 'gerente', 'supervisor', 'cliente'));

-- 5) Promover os administradores atuais a "master".
--    No modelo antigo, "admin" era o superusuário da plataforma — que agora
--    se chama "master". Daqui pra frente "admin" = dono de uma organização.
update perfis set role = 'master', organizacao_id = null where role = 'admin';

-- 6) (opcional) Garantir que uma conta específica seja master pelo e-mail.
--    Descomente e ajuste o e-mail se precisar promover manualmente:
-- update perfis set role = 'master', organizacao_id = null
--   where email = 'seu-email@exemplo.com';
