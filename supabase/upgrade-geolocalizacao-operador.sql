-- ════════════════════════════════════════════════════════════════════════════
-- Localização do operador em toda leitura e batida (scanner, rosto e Registro de
-- ponto) + o local do evento, para marcar o que foi feito FORA dele
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Pedido do Juan (08/10/2026, VITAL): depois do dia em que
-- não dava para saber quem estava de fato no estádio, toda leitura do operador
-- grava onde o APARELHO DO OPERADOR estava. Fora do local, a batida vale do mesmo
-- jeito, mas fica marcada para a conferência — só admin/master veem. O
-- colaborador não vê nada disso.
--
-- O local do evento é configurado em Editar evento → "Local do evento no mapa"
-- (ponto + raio). Sem ele configurado, a localização é gravada mas nada é
-- marcado como "fora".
--
-- Rodar no SQL Editor do Supabase. Idempotente. Antes de rodar, o sistema
-- funciona como hoje (só não grava estas colunas).
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table eventos
  add column if not exists local_latitude double precision,
  add column if not exists local_longitude double precision,
  add column if not exists local_raio_m integer not null default 800;

alter table registros
  add column if not exists precisao_m integer,
  add column if not exists distancia_m integer,
  add column if not exists fora_do_local boolean;

alter table leituras_qr
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists precisao_m integer,
  add column if not exists distancia_m integer,
  add column if not exists fora_do_local boolean;

comment on column registros.fora_do_local is
  'true = o aparelho que registrou estava fora do raio do local do evento; null = sem localização ou local do evento não configurado.';

commit;

-- ROLLBACK
--   alter table leituras_qr drop column if exists fora_do_local, drop column if exists distancia_m,
--     drop column if exists precisao_m, drop column if exists longitude, drop column if exists latitude;
--   alter table registros drop column if exists fora_do_local, drop column if exists distancia_m, drop column if exists precisao_m;
--   alter table eventos drop column if exists local_raio_m, drop column if exists local_longitude, drop column if exists local_latitude;
