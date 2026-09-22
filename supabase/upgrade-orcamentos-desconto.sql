-- ════════════════════════════════════════════════════════════════════════════
-- Orçamentos — desconto, aparece na nota
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível.
--
-- O Juan pediu (22/09/2026): dar desconto pro cliente e isso constar no PDF.
-- `desconto` é abatido do subtotal (valores × dias + itens adicionais) na
-- hora de calcular `valor_total` — nunca deixa o total ficar negativo (a
-- aplicação limita em lib/actions-orcamentos.ts e lib/orcamentos.ts).
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table orcamentos add column if not exists desconto numeric(10,2) not null default 0 check (desconto >= 0);

commit;

-- ROLLBACK
--   alter table orcamentos drop column if exists desconto;
