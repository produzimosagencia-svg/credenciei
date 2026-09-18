-- ════════════════════════════════════════════════════════════════════════════
-- Gastos — o lançamento já foi pago, ou é conta a pagar?
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. O Juan pediu (15/09/2026): no lançamento, faltava
-- dizer se aquele gasto já saiu do caixa ou ainda vai (uma nota que chegou
-- mas só vence semana que vem, por exemplo) — separado de quem é o
-- `pagador` (esse é sobre reembolso a uma pessoa, este é sobre a conta).
--
-- Default `true` de propósito: o uso mais comum do módulo é registrar um
-- gasto que JÁ aconteceu ("gastei 850 com estrutura") — e todo gasto já
-- lançado antes desta coluna existir também já foi pago, não vira "a pagar"
-- do nada assim que a coluna aparecer.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table gastos_evento add column if not exists pago boolean not null default true;

create index if not exists gastos_evento_por_pago on gastos_evento (pago);

commit;

-- ROLLBACK
--   begin;
--     drop index if exists gastos_evento_por_pago;
--     alter table gastos_evento drop column if exists pago;
--   commit;
