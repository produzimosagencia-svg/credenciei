-- ════════════════════════════════════════════════════════════════════════════
-- Mais de uma FUNÇÃO por pessoa — com troca de perfil na foto do usuário
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Uma tabela nova; nada que existe muda.
--
-- ─── COMO FUNCIONA ──────────────────────────────────────────────────────────
--
-- O CPF continua sendo UM login e UMA linha em `perfis` — a função que está lá
-- (`perfis.role`) é a BASE da pessoa. Quando ela ganha uma função a mais (um
-- supervisor que também é Gestor de credenciamento, um Encarregado que também é
-- supervisor…), a função extra mora aqui. Na tela, a pessoa clica na foto e
-- troca de perfil; o sistema passa a tratá-la, naquele momento, como a função
-- escolhida — e SÓ ela: nunca as duas ao mesmo tempo.
--
-- Só três funções podem ser "extras": supervisor, Gestor de credenciamento
-- (operador_portao) e Encarregado. Administrador, master, suporte e produtor
-- são identidades próprias e não se misturam.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists perfil_funcoes (
  id              uuid primary key default gen_random_uuid(),
  perfil_id       uuid not null references perfis(id) on delete cascade,
  role            text not null check (role in ('supervisor', 'operador_portao', 'encarregado')),
  -- A organização DESTA função (o Encarregado não tem: o escopo dele vive em encarregados_setor).
  organizacao_id  uuid references organizacoes(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (perfil_id, role)
);

create index if not exists perfil_funcoes_perfil on perfil_funcoes (perfil_id);

-- Mesmo padrão das tabelas novas: o acesso é só pelo servidor (service role).
alter table perfil_funcoes enable row level security;

-- Quem JÁ combinava funções do jeito antigo (um Gestor de credenciamento, administrador…
-- que ganhou vínculo de supervisor sem trocar de papel) passa a ter a função de supervisor
-- registrada de verdade — e a poder trocar de perfil pela foto do usuário.
insert into perfil_funcoes (perfil_id, role, organizacao_id)
select distinct on (p.id) p.id, 'supervisor', e.organizacao_id
from perfis p
join supervisor_setores ss on ss.perfil_id = p.id
join fornecedores f on f.id = ss.fornecedor_id
join eventos e on e.id = f.evento_id
where p.role in ('operador_portao', 'encarregado', 'admin', 'gerente', 'cliente')
on conflict (perfil_id, role) do nothing;

commit;
