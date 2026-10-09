-- ════════════════════════════════════════════════════════════════════════════
-- Endereço das tentativas recusadas por estar FORA DO LOCAL do evento
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Uma coluna em `leituras_qr`.
--
-- Pedido do Juan (08/10/2026): quem tenta bater o ponto fora do raio do local
-- do evento é recusado, e isso precisa ficar no nome da pessoa — "no tal dia,
-- tal pessoa tentou bater fora do evento" — COM o endereço de onde ela tentou.
-- O endereço (aproximado, a partir do GPS) é gravado aqui, junto da tentativa.
--
-- Sem rodar este arquivo, a tentativa continua sendo registrada (com latitude,
-- longitude e distância) e o endereço vai só para a auditoria.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table leituras_qr
  add column if not exists endereco_aproximado text;

create index if not exists leituras_qr_fora_do_local
  on leituras_qr (evento_id, created_at desc) where resultado = 'fora_do_local';

notify pgrst, 'reload schema';

-- ROLLBACK
--   drop index if exists leituras_qr_fora_do_local;
--   alter table leituras_qr drop column if exists endereco_aproximado;
