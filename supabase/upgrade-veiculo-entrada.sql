-- ════════════════════════════════════════════════════════════════════════════
-- Entrada de veículo pelo scanner — horário de liberação
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. `upgrade-veiculos.sql` já previa esta bifurcação:
-- "se um dia virar batida de ponto, é tabela nova de registros — não é
-- ampliar esta [veiculos]." O pedido chegou (23/09/2026): ao escanear o QR do
-- veículo na portaria e a entrada ser liberada, precisa aparecer com horário
-- no link público do condutor e no painel do admin, e ir pra auditoria.
--
-- TABELA NOVA, NÃO COLUNA EM `veiculos`
--
-- Um veículo pode ter mais de um dia autorizado no mesmo evento
-- (`veiculo_dias`) e pode ser escaneado mais de uma vez (saiu e voltou). Uma
-- coluna única em `veiculos` guardaria só a ÚLTIMA liberação e apagaria as
-- anteriores. Aqui cada escaneamento aprovado (status 'ativo') vira uma
-- linha; painel e link público mostram a mais recente
-- (`order by liberado_em desc limit 1`) — ver lib/veiculos-publico.ts e
-- app/admin/veiculos/page.tsx.
--
-- Não bate ponto de verdade (sem entrada/saída, sem janela) — é só o
-- carimbo de "quando a portaria liberou este veículo", junto de quem liberou.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists veiculo_entradas (
  id                     uuid primary key default gen_random_uuid(),
  veiculo_id             uuid not null references veiculos(id) on delete cascade,
  evento_id              uuid not null references eventos(id) on delete cascade,
  liberado_em            timestamptz not null default now(),
  liberado_por_perfil_id uuid references perfis(id) on delete set null
);

create index if not exists veiculo_entradas_veiculo on veiculo_entradas (veiculo_id, liberado_em desc);
create index if not exists veiculo_entradas_evento on veiculo_entradas (evento_id, liberado_em desc);

alter table veiculo_entradas enable row level security;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists veiculo_entradas;
--   commit;
