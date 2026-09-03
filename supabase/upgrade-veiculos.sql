-- ════════════════════════════════════════════════════════════════════════════
-- Veículos — quem entra de caminhão/van no evento, e com qual placa
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente muda.
--
-- POR QUE ESTA TABELA
--
-- Pedido do Juan (03/09/2026): a portaria precisa saber se AQUELE veículo
-- pode entrar, e quem está dirigindo. Hoje isso não existe em lugar nenhum —
-- o sistema credencia PESSOA, e caminhão de montagem entra na base de
-- confiança de quem está no portão.
--
-- `funcionario_id` NOT NULL é a regra central, não um detalhe: todo veículo
-- é vinculado ao CPF de alguém JÁ CREDENCIADO no evento. Alguém dirige o
-- caminhão, e essa pessoa responde pelo veículo. Sem isso a tabela viraria
-- uma lista de placas soltas, sem ninguém a quem perguntar.
--
-- `evento_id` além do funcionário (que já leva ao evento pelo setor): a
-- consulta da portaria é sempre "as placas DESTE evento", e passar por
-- funcionarios→fornecedores→eventos em toda leitura de portão é junção que
-- não se paga. Mesma escolha já feita em `registros`.
--
-- ESCOPO DELIBERADO — SÓ CADASTRO E CONSULTA
--
-- Decidido com o Juan: o veículo NÃO bate ponto. Não tem QR próprio, não
-- entra no scanner, não gera histórico de entrada/saída. A portaria consulta
-- pela placa e confere. Se um dia virar batida de ponto, é tabela nova de
-- registros — não é ampliar esta.
--
-- `veiculo_dias`: quais dias do evento aquele veículo pode entrar. Tabela
-- filha em vez de `date[]` pelo mesmo motivo de `aviso_setores` — é o que
-- permite a portaria consultar "o que entra hoje" com um índice, em vez de
-- varrer array. Sem nenhuma linha = autorizado em todos os dias do evento
-- (o caso comum: o caminhão da montagem vai e volta a semana inteira).
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ
--
-- Não mexe em `funcionarios`, `eventos` nem `registros`. Não cria RLS com
-- policy: o projeto é service-role-only, e estas tabelas seguem o lockdown
-- (`enable row level security` sem policy, igual `suporte_escopo` e
-- `alteracoes_cadastro`).
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists veiculos (
  id                   uuid primary key default gen_random_uuid(),
  evento_id            uuid not null references eventos(id) on delete cascade,
  -- O condutor. Quem responde pelo veículo, e é sempre alguém credenciado.
  funcionario_id       uuid not null references funcionarios(id) on delete cascade,
  empresa              text,
  -- Guardada SEM máscara e em maiúscula (a action normaliza), pra busca da
  -- portaria achar tanto "ABC1D23" quanto "abc-1d23".
  placa                text not null,
  modelo               text not null,
  cor                  text,
  -- caminhao | van | carro | moto | outro
  tipo                 text,
  observacoes          text,
  criado_por_perfil_id uuid references perfis(id) on delete set null,
  created_at           timestamptz not null default now()
);

-- A mesma placa não entra duas vezes no mesmo evento: é erro de digitação ou
-- cadastro em duplicidade, e a portaria consultando encontraria duas
-- respostas pra mesma pergunta.
create unique index if not exists veiculos_evento_placa_uniq
  on veiculos (evento_id, placa);

create index if not exists veiculos_evento on veiculos (evento_id);
create index if not exists veiculos_funcionario on veiculos (funcionario_id);

create table if not exists veiculo_dias (
  id         uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references veiculos(id) on delete cascade,
  data       date not null
);

create unique index if not exists veiculo_dias_uniq
  on veiculo_dias (veiculo_id, data);
create index if not exists veiculo_dias_data on veiculo_dias (data);

alter table veiculos enable row level security;
alter table veiculo_dias enable row level security;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists veiculo_dias;
--     drop table if exists veiculos;
--   commit;
