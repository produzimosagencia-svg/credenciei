-- ════════════════════════════════════════════════════════════════════════════
-- Lista manual — entrada SEM QR Code (convidados, prestadores, equipe interna)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente muda — o credenciamento com
-- QR Code (funcionarios, registros, scanner) não é tocado.
--
-- POR QUE ESTA TABELA (Juan, 16/10/2026)
--
-- Convidado da lista, prestador de serviço, equipe interna: gente autorizada a
-- entrar que não recebe credencial, link nem QR. O admin cadastra antes; na
-- portaria a pessoa mostra o documento, o operador acha pelo nome ou CPF e
-- confirma a entrada — com horário e quem confirmou.
--
-- Tabela própria, e não `funcionarios`: quem está aqui não é da equipe de um
-- fornecedor, não bate ponto (entrada/meio/saída), não entra em relatório de
-- pagamento nem recebe WhatsApp. Misturar faria cada regra do credenciamento
-- precisar de uma exceção.
--
-- UMA LINHA POR PESSOA, A ENTRADA NA PRÓPRIA LINHA
--
-- `presente_em` nulo = ainda não chegou. A confirmação é um UPDATE com
-- `presente_em is null` no filtro (lib/actions-lista-manual.ts): dois
-- operadores confirmando a mesma pessoa ao mesmo tempo — só um grava, o outro
-- recebe "já entrou às HH:MM". Correção (desfazer uma entrada) só por quem
-- gerencia a lista, com motivo, e tudo vai para a auditoria
-- (`alteracoes_cadastro`), que é o histórico do sistema.
--
-- Tirar da lista não apaga: `removido_em` esconde a linha e o histórico de
-- quem cadastrou/confirmou continua. O CPF fica sem máscara (11 dígitos) para
-- a busca da portaria; as telas mostram mascarado.
--
-- Mesmo lockdown das outras tabelas: o projeto é service-role-only, RLS ligado
-- sem policy (igual `veiculos` e `alteracoes_cadastro`).
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists lista_manual (
  id                       uuid primary key default gen_random_uuid(),
  evento_id                uuid not null references eventos(id) on delete cascade,
  nome                     text not null,
  -- Obrigatório no sistema, como nome e telefone (a tela e a action exigem); só dígitos, CPF válido.
  cpf                      text,
  telefone                 text,
  -- "Convidado / Lista VIP", "Prestador de serviço", "Equipe / Colaborador", "Outro" — ou uma nova, digitada.
  categoria                text not null,
  criado_por_perfil_id     uuid references perfis(id) on delete set null,
  criado_por_nome          text,
  created_at               timestamptz not null default now(),
  atualizado_em            timestamptz,
  -- A entrada confirmada na portaria. Nulo = ainda não chegou.
  presente_em              timestamptz,
  confirmado_por_perfil_id uuid references perfis(id) on delete set null,
  confirmado_por_nome      text,
  -- Tirada da lista: a linha some das telas, o histórico fica.
  removido_em              timestamptz,
  removido_por_perfil_id   uuid references perfis(id) on delete set null,
  constraint lista_manual_cpf_formato check (cpf is null or cpf ~ '^[0-9]{11}$')
);

-- O mesmo CPF não entra duas vezes na lista do MESMO evento (quem foi tirado da lista não conta).
-- Em outro evento é outra lista: estar na lista de um evento não autoriza em nenhum outro.
create unique index if not exists lista_manual_evento_cpf_uniq
  on lista_manual (evento_id, cpf) where cpf is not null and removido_em is null;

create index if not exists lista_manual_evento on lista_manual (evento_id, nome) where removido_em is null;

alter table lista_manual enable row level security;

commit;

-- ROLLBACK
--   begin;
--     drop table if exists lista_manual;
--   commit;
