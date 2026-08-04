-- ============================================================
-- UPGRADE: assistente de IA (Credenciei IA)
--
-- Guarda o que a IA fez a mando de quem. Só ações de escrita entram aqui —
-- consulta não gera linha, senão a tabela vira log de conversa.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

create table if not exists auditoria_ia (
  id              uuid primary key default gen_random_uuid(),
  perfil_id       uuid references perfis(id) on delete set null,
  -- Nome e papel ficam copiados: a auditoria precisa continuar legível mesmo
  -- depois que o usuário for excluído do sistema.
  perfil_nome     text,
  perfil_role     text,
  organizacao_id  uuid references organizacoes(id) on delete set null,
  acao            text not null,
  detalhes        jsonb,
  origem          text not null default 'assistente_ia',
  criado_em       timestamptz not null default now()
);

create index if not exists auditoria_ia_perfil_idx on auditoria_ia(perfil_id, criado_em desc);
create index if not exists auditoria_ia_org_idx    on auditoria_ia(organizacao_id, criado_em desc);

alter table auditoria_ia enable row level security;
