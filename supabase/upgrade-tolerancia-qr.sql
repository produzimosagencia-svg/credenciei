-- ============================================================
-- Tolerância de liberação do QR Code
--
-- O QR fica EMBAÇADO até pouco antes da hora de bater o ponto, e só então
-- aparece. O objetivo é o compartilhamento: hoje a pessoa pode mandar o print
-- no grupo com dias de antecedência e alguém usar por ela. Com a liberação
-- amarrada ao horário, a janela em que o QR é útil encolhe para os minutos em
-- que a própria pessoa deveria estar no portão.
--
-- Quantos minutos antes é decisão do cliente: 15 é o padrão porque é a folga
-- que a maioria dá para a fila do credenciamento.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table eventos add column if not exists tolerancia_qr_min int not null default 15;

-- Zero significaria liberar o QR só no instante exato da abertura, o que na
-- prática deixaria a fila parada esperando o relógio virar.
alter table eventos drop constraint if exists eventos_tolerancia_qr_check;
alter table eventos add constraint eventos_tolerancia_qr_check
  check (tolerancia_qr_min >= 0 and tolerancia_qr_min <= 240);
