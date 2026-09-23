-- ════════════════════════════════════════════════════════════════════════════
-- Veículos — autocadastro público, sem exigir credenciamento prévio, com QR
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente é apagada.
--
-- POR QUE O CONDUTOR DEIXA DE SER `funcionario_id` OBRIGATÓRIO
--
-- Pedido do Juan (23/09/2026): motorista pode não ser da equipe — hóspede de
-- hotel, pessoa do lounge. `funcionario_id` vira NULLABLE; a tabela ganha
-- `condutor_nome`/`condutor_cpf`/`condutor_telefone` próprios, preenchidos
-- direto no cadastro (manual ou pelo link público). `funcionario_id`
-- continua existindo pra quando o admin usa o atalho "já é da equipe,
-- buscar por CPF" — só deixou de ser obrigatório.
--
-- NOTA — A "TRAVA DE 1 VEÍCULO POR CPF" DO PEDIDO NÃO EXISTIA NO BANCO
--
-- O único índice único de sempre é `veiculos_evento_placa_uniq (evento_id,
-- placa)` — CPF nunca foi restrição de unicidade aqui. Essa migração não
-- mexe nisso: placa duplicada no mesmo evento continua barrada, do jeito
-- que o pedido pede pra manter.
--
-- STATUS E TIPO_CADASTRO SÃO TEXTO LIVRE, SEM CHECK CONSTRAINT
--
-- Mesma decisão de `gastos_evento.categoria`/`backlog_itens.status`: a régua
-- vive no código (lib/veiculos-constantes.ts), evoluir os valores não pode
-- exigir migração de banco.
--
--   status:        'pendente' | 'ativo' | 'bloqueado' | 'cancelado'
--   tipo_cadastro: 'manual' | 'colaborador' | 'lounge'
--
-- Cadastro MANUAL (pela produção) nasce `ativo` direto — quem cadastrou já
-- viu a pessoa e o veículo. Cadastro pelo LINK PÚBLICO nasce `pendente` — só
-- um master/admin/suporte aprovando (`alterarStatusVeiculo`) o QR passa a
-- valer pra entrar. Veículos que já existiam antes desta migração recebem os
-- defaults ('manual', 'ativo') e continuam válidos sem precisar reaprovação.
--
-- QR DO VEÍCULO: TOKEN OPACO, NÃO O FORMATO c2/c3/c4 DE CREDENCIAL
--
-- O formato de `lib/credencial-qr.ts` é amarrado à FASE do evento de uma
-- PESSOA (montagem/evento/desmontagem) — conceito que não existe pra
-- veículo. `qr_token` é só um token aleatório (`randomBytes`, mesmo padrão
-- de `lib/cadastro-individual.ts`); o QR encode a URL pública
-- `/veiculo/{qr_token}`, que mostra o status na hora — mesma ideia de
-- `eventos.token_portaria`.
--
-- `veiculo_links`: UM link estável por (evento, tipo) — igual
-- `fornecedores.token_formulario` (persistente, regenerável), não o padrão
-- efêmero de 48h de `cadastro-individual`. `tipo` também é texto livre, pra
-- caber um terceiro tipo no futuro sem migração.
--
-- RLS SEM POLICY, DE PROPÓSITO — mesmo padrão do resto do sistema. Todo
-- acesso real passa por `supabaseAdmin` no servidor.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table veiculos
  alter column funcionario_id drop not null,
  add column if not exists condutor_nome text,
  add column if not exists condutor_cpf text,
  add column if not exists condutor_telefone text,
  add column if not exists ano integer,
  add column if not exists setor text,
  add column if not exists tipo_cadastro text not null default 'manual',
  add column if not exists status text not null default 'ativo',
  add column if not exists qr_token text,
  add column if not exists foto_pessoa_path text;

create unique index if not exists veiculos_qr_token_uniq on veiculos (qr_token);
create index if not exists veiculos_status on veiculos (status);

create table if not exists veiculo_links (
  id                   uuid primary key default gen_random_uuid(),
  evento_id            uuid not null references eventos(id) on delete cascade,
  tipo                 text not null,
  token                text not null,
  ativo                boolean not null default true,
  criado_por_perfil_id uuid references perfis(id) on delete set null,
  created_at           timestamptz not null default now()
);

create unique index if not exists veiculo_links_evento_tipo_uniq on veiculo_links (evento_id, tipo);
create unique index if not exists veiculo_links_token_uniq on veiculo_links (token);

alter table veiculo_links enable row level security;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists veiculo_links;
--     drop index if exists veiculos_status;
--     drop index if exists veiculos_qr_token_uniq;
--     alter table veiculos
--       drop column if exists foto_pessoa_path,
--       drop column if exists qr_token,
--       drop column if exists status,
--       drop column if exists tipo_cadastro,
--       drop column if exists setor,
--       drop column if exists ano,
--       drop column if exists condutor_telefone,
--       drop column if exists condutor_cpf,
--       drop column if exists condutor_nome,
--       alter column funcionario_id set not null;
--   commit;
