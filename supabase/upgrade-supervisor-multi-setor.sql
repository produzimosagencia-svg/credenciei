-- ════════════════════════════════════════════════════════════════════════════
-- Supervisor em MAIS DE UM SETOR, com um login só
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e reversível. Nenhuma coluna existente muda de tipo ou de sentido, e
-- o backfill deixa todo supervisor de hoje exatamente como está.
--
-- ─── O PROBLEMA ─────────────────────────────────────────────────────────────
--
-- `perfis.fornecedor_id` é uma coluna só: um supervisor, um setor. Quem cobre
-- dois setores precisava de dois logins (dois CPFs), o que não existe — a
-- pessoa tem um CPF só. Pior: `criarSupervisor` tratava o segundo setor como
-- REALOCAÇÃO, então cadastrar a mesma pessoa no setor B a TIRAVA do setor A,
-- silenciosamente.
--
-- ─── POR QUE UMA TABELA, E NÃO UM ARRAY NA COLUNA ───────────────────────────
--
-- Vinte e nove lugares do código comparam `perfil.fornecedor_id === algo`.
-- Trocar a coluna por um array obrigaria a reescrever os vinte e nove, e cada
-- um deles é uma checagem de PERMISSÃO — errar em qualquer um abre acesso a
-- setor de outro cliente, ou tranca o supervisor no meio do evento.
--
-- Com uma tabela à parte o sentido de `fornecedor_id` só se refina:
--
--   supervisor_setores → a quais setores esta pessoa PODE acessar
--   perfis.fornecedor_id → qual deles ela está VENDO agora
--
-- Os vinte e nove continuam certos sem alteração nenhuma: todos passam a
-- significar "o setor aberto no momento". Trocar de setor vira uma escrita
-- em `fornecedor_id`, validada contra esta tabela — um ponto de decisão, não
-- vinte e nove.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists supervisor_setores (
  perfil_id     uuid not null references perfis(id) on delete cascade,
  fornecedor_id uuid not null references fornecedores(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (perfil_id, fornecedor_id)
);

comment on table supervisor_setores is
  'A quais setores um supervisor tem acesso. `perfis.fornecedor_id` continua '
  'dizendo qual deles ele está vendo AGORA — trocar de setor grava lá, e só '
  'é aceito se o par existir aqui.';

create index if not exists supervisor_setores_perfil on supervisor_setores(perfil_id);
create index if not exists supervisor_setores_fornecedor on supervisor_setores(fornecedor_id);

alter table supervisor_setores disable row level security;

-- Backfill: todo supervisor que hoje tem um setor passa a tê-lo aqui também.
-- Sem isto, o primeiro deploy tiraria o acesso de todos eles de uma vez.
insert into supervisor_setores (perfil_id, fornecedor_id)
select id, fornecedor_id from perfis
where role = 'supervisor' and fornecedor_id is not null
on conflict do nothing;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists supervisor_setores;
--   commit;
