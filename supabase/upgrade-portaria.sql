-- ════════════════════════════════════════════════════════════════════════════
-- QR Code da portaria — auto cadastro de quem chega sem estar na lista
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e reversível. Nenhuma tela existente lê estas colunas, e os padrões
-- fazem todos os eventos continuarem exatamente como estão.
--
-- ─── O QUE ESTA MIGRAÇÃO NÃO FAZ ────────────────────────────────────────────
--
-- Ela não cria fluxo de cadastro nenhum. O cadastro público por setor já
-- existe há tempo, em `/form/{token_formulario}`, e já resolve o difícil:
-- valida CPF, impede duplicidade, devolve a credencial de quem já está
-- cadastrado, recusa a mesma pessoa em dois setores do mesmo evento, sobe
-- foto, pede consentimento e agenda as boas-vindas.
--
-- O que faltava era uma PORTA: uma página do evento onde a pessoa escolhe o
-- setor e cai no formulário certo. Estas colunas existem só para essa porta
-- ter endereço próprio e poder ser fechada.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── O endereço público da portaria ──────────────────────────────────────────
--
-- Um token próprio, e não o id do evento. O id aparece nas URLs do painel;
-- reusá-lo aqui faria um cartaz impresso na portaria revelar o endereço
-- interno do evento. Separando, o cartaz pode ser trocado (gerando um token
-- novo) sem mexer em mais nada.

alter table eventos add column if not exists token_portaria text;
alter table eventos add column if not exists portaria_ativa boolean not null default false;

create unique index if not exists eventos_token_portaria_unico
  on eventos (token_portaria) where token_portaria is not null;

comment on column eventos.token_portaria is
  'Token público do QR Code impresso na portaria. Trocar este valor invalida '
  'todos os cartazes já impressos — é assim que se revoga um QR que vazou.';

comment on column eventos.portaria_ativa is
  'Interruptor do auto cadastro. Falso por padrão: um evento não passa a '
  'aceitar gente da rua porque alguém esqueceu de configurar.';

-- ── De onde veio cada cadastro ──────────────────────────────────────────────
--
-- Rastreabilidade pedida para auditoria: no fechamento, saber que uma pessoa
-- entrou pelo cartaz da portaria — e não pela planilha nem pelo link que o
-- supervisor mandou — muda a conversa sobre quem autorizou aquela contratação.

alter table funcionarios add column if not exists origem text;

comment on column funcionarios.origem is
  'portaria | formulario | planilha | admin. Nulo nos cadastros anteriores a '
  'esta coluna — ausência aqui significa "antes de existir o registro", e não '
  '"origem desconhecida".';

-- Contar quantos entraram pela portaria, por evento, sem varrer a tabela.
create index if not exists funcionarios_origem on funcionarios (origem)
  where origem is not null;

commit;

-- ROLLBACK
--   begin;
--     drop index if exists eventos_token_portaria_unico;
--     drop index if exists funcionarios_origem;
--     alter table eventos drop column if exists token_portaria;
--     alter table eventos drop column if exists portaria_ativa;
--     alter table funcionarios drop column if exists origem;
--   commit;
