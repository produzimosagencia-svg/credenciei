-- Saídas e voltas no meio do turno — entrada, saída, entrada, saída, sem limite.
--
-- Pedido do Juan (26/09/2026, Pontal Weekend): quem trabalhou à tarde saiu e
-- voltou à noite. A volta reabre o turno (o banco só guarda UMA entrada e UMA
-- saída por pessoa/dia), e a saída do meio era apagada — ficava só na
-- Auditoria, e o histórico mostrava "saída não realizada". Agora cada saída
-- seguida de volta vira uma PAUSA aqui: o histórico mostra todas e as horas
-- descontam o tempo fora.
--
-- O sistema tolera esta tabela ainda não existir (só não grava pausa).

begin;

create table if not exists pausas_turno (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios(id) on delete cascade,
  evento_id uuid not null references eventos(id) on delete cascade,
  -- O dia de trabalho (o mesmo `data_ref` das batidas do turno).
  data_ref date not null,
  saiu_em timestamptz not null,
  voltou_em timestamptz not null,
  -- Quem registrou a volta (operador do scanner ou do registro assistido).
  registrado_por uuid references perfis(id) on delete set null,
  origem text not null default 'scanner', -- scanner | assistido | recuperado
  created_at timestamptz not null default now()
);

create index if not exists pausas_turno_por_pessoa on pausas_turno (funcionario_id, evento_id, data_ref);

alter table pausas_turno enable row level security;

-- Recupera as voltas que já aconteceram e ficaram só na Auditoria
-- ("Saída às HH:MM" → "Turno reaberto às HH:MM").
insert into pausas_turno (funcionario_id, evento_id, data_ref, saiu_em, voltou_em, registrado_por, origem)
select
  a.funcionario_id,
  a.evento_id,
  coalesce(
    (select r.data_ref from registros r
      where r.funcionario_id = a.funcionario_id and r.evento_id = a.evento_id
        and r.tipo = 'entrada' and r.created_at <= a.created_at
      order by r.created_at desc limit 1),
    (a.created_at at time zone 'America/Sao_Paulo')::date
  ),
  -- A saída foi no mesmo dia da volta; se o horário der depois da volta, foi na véspera.
  case
    when ((a.created_at at time zone 'America/Sao_Paulo')::date
          + substring(a.valor_anterior from '(\d{2}:\d{2})')::time) at time zone 'America/Sao_Paulo' > a.created_at
    then ((a.created_at at time zone 'America/Sao_Paulo')::date - 1
          + substring(a.valor_anterior from '(\d{2}:\d{2})')::time) at time zone 'America/Sao_Paulo'
    else ((a.created_at at time zone 'America/Sao_Paulo')::date
          + substring(a.valor_anterior from '(\d{2}:\d{2})')::time) at time zone 'America/Sao_Paulo'
  end,
  a.created_at,
  a.usuario_responsavel_id,
  'recuperado'
from alteracoes_cadastro a
where a.acao = 'REABERTURA_TURNO'
  and a.funcionario_id is not null
  and a.evento_id is not null
  and substring(a.valor_anterior from '(\d{2}:\d{2})') is not null
  and not exists (
    select 1 from pausas_turno p
    where p.funcionario_id = a.funcionario_id and p.evento_id = a.evento_id and p.voltou_em = a.created_at
  );

commit;
