-- ════════════════════════════════════════════════════════════════════════════
-- Orçamentos — dias do evento multiplicam dia/funcionário/técnico
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível.
--
-- O Juan pediu (22/09/2026): evento de mais de um dia. Antes disso o
-- comercial representava um segundo dia duplicando um item adicional tipo
-- "Segundo dia de evento" na mão. Em vez disso, um único campo `dias`
-- multiplica os TRÊS valores de base juntos (dia + funcionário + técnico) —
-- os itens adicionais continuam avulsos, sem multiplicar (ex.: "Combustível"
-- é o mesmo custo não importa quantos dias o evento tem).
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table orcamentos add column if not exists dias integer not null default 1 check (dias >= 1);

commit;

-- ROLLBACK
--   alter table orcamentos drop column if exists dias;
