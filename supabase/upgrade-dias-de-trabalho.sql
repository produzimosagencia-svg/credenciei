-- ============================================================
-- Dias de trabalho do evento + descredenciamento
--
-- ─── O QUE MUDA ─────────────────────────────────────────────────────────────
--
-- Um evento deixa de ser "um dia com três janelas" e passa a ser:
--
--   DIA PRINCIPAL      — a data do evento. Entrada, MEIO e saída seguem os
--                        horários que o produtor configurou (eventos.janela_*).
--   DIAS DE PREPARAÇÃO — montagem, organização, desmontagem. Entrada e saída
--                        livres; o meio é a entrada REAL de cada pessoa + 4h.
--
-- ─── POR QUE REAPROVEITAR `jornada_dias` ────────────────────────────────────
--
-- Ela já é exatamente "uma linha por (evento, data) de trabalho" — criada para
-- as jornadas recorrentes. Criar uma tabela nova para os dias de preparação
-- deixaria duas fontes de verdade para a mesma pergunta ("esse dia é dia de
-- trabalho neste evento?"), e toda consulta de pendência, relatório e
-- lembrete teria que unir as duas. Então ela cresce em vez de ganhar irmã:
--
--   * `tipo` separa o dia principal dos dias de preparação;
--   * os horários viram OPCIONAIS, porque dia de preparação não tem horário —
--     é justamente o que "entrada livre" significa;
--   * `jornada_id` vira opcional, porque dia escolhido a dedo pelo produtor
--     não vem de nenhuma regra de recorrência.
--
-- ─── DESCREDENCIAMENTO ──────────────────────────────────────────────────────
--
-- Não existia. A palavra só aparecia como rótulo da etapa de saída, e depois
-- da última batida nada acontecia. Agora existe de verdade — e NUNCA apaga
-- ninguém: a linha em `funcionarios` é o que mantém a pessoa na base geral e
-- guarda o historico dela. Descredenciar é encerrar o vinculo com AQUELE
-- evento, e nada mais.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- ─── 1. jornada_dias vira "os dias de trabalho do evento" ───────────────────

alter table jornada_dias add column if not exists tipo text not null default 'preparacao';

alter table jornada_dias drop constraint if exists jornada_dias_tipo_check;
alter table jornada_dias add constraint jornada_dias_tipo_check
  check (tipo in ('preparacao', 'principal'));

-- Dia de preparação não tem horário: entrada e saída são livres. Sem isto o
-- produtor seria obrigado a inventar um horário para poder marcar o dia.
alter table jornada_dias alter column entrada_inicio drop not null;
alter table jornada_dias alter column entrada_fim    drop not null;
alter table jornada_dias alter column saida_inicio   drop not null;
alter table jornada_dias alter column saida_fim      drop not null;

-- Dia escolhido a dedo não pertence a nenhuma regra de recorrência.
alter table jornada_dias alter column jornada_id drop not null;

-- Só pode haver UM dia principal por evento — é a data do evento.
create unique index if not exists jornada_dias_principal_unico
  on jornada_dias (evento_id) where tipo = 'principal';

-- Relatório de fechamento pergunta "quais dias este evento teve?" o tempo todo.
create index if not exists jornada_dias_evento_tipo_idx on jornada_dias (evento_id, tipo, data);

-- ─── 2. Descredenciamento ───────────────────────────────────────────────────
/*
 * `null` = credenciado. Preenchido = já cumpriu o evento e saiu.
 *
 * Coluna própria, e não reaproveitar `ativo`, porque os dois significam
 * coisas opostas: `ativo = false` é quem NUNCA foi liberado pra trabalhar
 * (cadastro acima do teto do setor), e descredenciado é quem trabalhou o
 * evento inteiro. Juntar os dois num campo só apagaria a diferença entre
 * "não veio" e "cumpriu" bem no fechamento do pagamento.
 */
alter table funcionarios add column if not exists descredenciado_em timestamptz;

-- Quem registrou a saída que fechou o ciclo (ou o admin, quando manual).
alter table funcionarios add column if not exists descredenciado_por uuid references perfis(id);

-- "Quem ainda está credenciado neste setor?" é a pergunta do painel do setor.
create index if not exists funcionarios_credenciados_idx
  on funcionarios (fornecedor_id) where descredenciado_em is null;

-- ─── 3. Backfill: eventos que já existem ganham o dia principal ─────────────
/*
 * Todo evento já tinha um dia principal implícito — a data de início. Sem
 * materializar isso, os eventos antigos ficariam sem nenhum dia de trabalho
 * e sumiriam dos relatórios e das listas de pendência.
 *
 * Os horários NÃO são copiados de propósito: eles continuam morando em
 * `eventos.janela_*`, que segue sendo a fonte única. A linha aqui só declara
 * que aquele dia existe e que ele é o principal.
 */
-- Primeiro promove o dia que JA existe naquela data (vindo de uma jornada
-- recorrente). Sem isto o insert abaixo colidiria com a unique
-- (evento_id, data, turno) e o evento ficaria sem dia principal nenhum.
update jornada_dias d
   set tipo = 'principal'
  from eventos e
 where d.evento_id = e.id
   and d.data = (e.data_inicio at time zone 'America/Sao_Paulo')::date
   and d.turno = 0
   and d.tipo <> 'principal'
   and not exists (
     select 1 from jornada_dias x where x.evento_id = e.id and x.tipo = 'principal'
   );

-- Depois cria para os eventos que continuaram sem nenhum.
insert into jornada_dias (evento_id, jornada_id, data, turno, tipo)
select e.id, null, (e.data_inicio at time zone 'America/Sao_Paulo')::date, 0, 'principal'
  from eventos e
 where not exists (
   select 1 from jornada_dias d where d.evento_id = e.id and d.tipo = 'principal'
 )
on conflict (evento_id, data, turno) do nothing;
