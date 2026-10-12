-- ════════════════════════════════════════════════════════════════════════════
-- Batidas de ponto PROTEGIDAS — nenhuma some do sistema
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Pedido do Juan (12/10/2026, VITAL): "não pode sumir em
-- HIPÓTESE NENHUMA do sistema as batidas de ponto anteriores... o botão excluir
-- só tira o funcionário da equipe".
--
-- O sistema já não apaga ninguém pela tela nem pela IA (excluir = baixa), e não
-- exclui setor nem evento que tenha batida. Isto aqui é a rede de segurança no
-- BANCO, que vale até para uma aba antiga do navegador ou um script:
--
--   1. Toda batida apagada (correção de horário, volta ao trabalho no mesmo dia,
--      "apagar batida" do master) ganha uma cópia inteira em `registros_apagados`.
--   2. Uma ficha com batida não pode ser apagada — nem por cascata de setor ou
--      de evento. O banco recusa com a mensagem: "dê baixa".
--
-- Rode no SQL Editor do Supabase (uma vez). Pode rodar de novo sem problema.

begin;

create table if not exists registros_apagados (
  id              uuid primary key default gen_random_uuid(),
  registro_id     uuid not null,
  funcionario_id  uuid,
  evento_id       uuid,
  -- A linha inteira de `registros`, como estava.
  dados           jsonb not null,
  apagado_em      timestamptz not null default now()
);
create index if not exists registros_apagados_por_funcionario on registros_apagados (funcionario_id, apagado_em desc);
create index if not exists registros_apagados_por_evento on registros_apagados (evento_id, apagado_em desc);
alter table registros_apagados enable row level security;   -- só o servidor (service role) lê

create or replace function guardar_registro_apagado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into registros_apagados (registro_id, funcionario_id, evento_id, dados)
    values (old.id, old.funcionario_id, old.evento_id, to_jsonb(old));
  exception when others then
    -- A cópia nunca impede a operação; o erro vai pro log do banco.
    raise warning 'registros_apagados: não guardou a batida %: %', old.id, sqlerrm;
  end;
  return old;
end $$;

drop trigger if exists registros_guardar_apagado on registros;
create trigger registros_guardar_apagado
  before delete on registros
  for each row execute function guardar_registro_apagado();

create or replace function impedir_apagar_quem_tem_batida() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from registros where funcionario_id = old.id) then
    raise exception 'Esta pessoa tem batidas de ponto e não pode ser apagada. Dê baixa (Tirar da equipe): ela continua no relatório.'
      using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists funcionarios_impedir_apagar_com_batida on funcionarios;
create trigger funcionarios_impedir_apagar_com_batida
  before delete on funcionarios
  for each row execute function impedir_apagar_quem_tem_batida();

commit;

-- Conferir:   select count(*) from registros_apagados;
-- Reverter:
--     drop trigger if exists funcionarios_impedir_apagar_com_batida on funcionarios;
--     drop function if exists impedir_apagar_quem_tem_batida();
--     drop trigger if exists registros_guardar_apagado on registros;
--     drop function if exists guardar_registro_apagado();
--     -- (a tabela registros_apagados pode ficar: é só histórico)
