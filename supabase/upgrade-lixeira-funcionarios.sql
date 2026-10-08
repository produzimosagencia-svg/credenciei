-- ════════════════════════════════════════════════════════════════════════════
-- Lixeira de funcionários (o master restaura quem foi excluído) +
-- organização nas linhas de auditoria que ficaram sem ela
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível.
--
-- POR QUE (08/10/2026, VITAL): um supervisor excluiu da equipe uma pessoa que já
-- tinha registrado a entrada. Excluir apaga o cadastro, o QR e as batidas
-- (`on delete cascade`) e não havia como voltar atrás: a pessoa seguiu
-- trabalhando com o QR "inválido".
--
-- Agora, ANTES de qualquer exclusão, o sistema guarda aqui uma cópia completa —
-- o cadastro (com o mesmo id e o mesmo token do QR) e o que estava pendurado nele
-- (batidas, dias de trabalho, biometria, avaliação, pausas, veículos). O master
-- restaura pela tela "Excluídos": a pessoa volta com o MESMO QR, então o link que
-- ela recebeu no WhatsApp volta a funcionar.
--
-- Exclusões feitas ANTES desta migração não têm cópia — não dá para restaurar.
--
-- A segunda parte corrige a auditoria: exclusões (e outras ações) eram gravadas
-- sem `organizacao_id`, e por isso o administrador da organização não as via.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists funcionarios_excluidos (
  id uuid primary key default gen_random_uuid(),
  -- O id ORIGINAL do funcionário (volta igual na restauração). Sem FK: a linha não existe mais.
  funcionario_id uuid not null,
  evento_id uuid references eventos(id) on delete cascade,
  fornecedor_id uuid,
  nome text not null,
  cpf text not null,
  fornecedor_nome text,
  evento_nome text,
  -- A linha inteira de `funcionarios`.
  dados jsonb not null,
  -- { "registros": [...], "funcionario_dias": [...], ... } — o que o cascade apagaria.
  relacionados jsonb not null default '{}'::jsonb,
  batidas integer not null default 0,
  excluido_por uuid references perfis(id) on delete set null,
  excluido_por_nome text,
  motivo text,
  excluido_em timestamptz not null default now(),
  restaurado_em timestamptz,
  restaurado_por_nome text
);
create index if not exists funcionarios_excluidos_por_data on funcionarios_excluidos (excluido_em desc);
create index if not exists funcionarios_excluidos_por_cpf on funcionarios_excluidos (cpf);
create index if not exists funcionarios_excluidos_por_evento on funcionarios_excluidos (evento_id, excluido_em desc);

alter table funcionarios_excluidos enable row level security;

-- Auditoria: a organização vem do evento quando a linha foi gravada sem ela.
update alteracoes_cadastro a
   set organizacao_id = e.organizacao_id
  from eventos e
 where a.organizacao_id is null
   and a.evento_id = e.id
   and e.organizacao_id is not null;

commit;

-- ROLLBACK
--   drop table if exists funcionarios_excluidos;
