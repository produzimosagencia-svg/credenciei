-- ════════════════════════════════════════════════════════════════════════════
-- Aprovação de credenciamento — cadastro ≠ autorização
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Nenhuma tabela existente perde coluna.
--
-- POR QUE NÃO REAPROVEITAR `funcionarios.ativo`
--
-- `ativo` já tem um significado em produção: "tirar alguém do time depois de
-- já ter sido aprovado" (trava do scanner, filtro "não ativados" da tela do
-- setor, liberação de pagamento). Usar o mesmo booleano para "ninguém avaliou
-- ainda" perderia a diferença entre pendente e negado, e mudaria o
-- comportamento de todo mundo que já confia em `ativo` hoje. `ativo` continua
-- exatamente como está — a trava nova convive com ela, não a substitui.
--
-- STATUS É TEXTO LIVRE, SEM CHECK CONSTRAINT
--
-- Mesma decisão de `orcamentos.status`/`veiculos.status`: a régua vive no
-- código (lib/credenciamento-constantes.ts), adicionar um estado novo não
-- pode exigir migração de banco.
--
-- DEFAULT 'aprovado' — NINGUÉM EXISTENTE MUDA DE COMPORTAMENTO
--
-- Todo funcionário já cadastrado, e todo cadastro feito por alguém já
-- confiável do sistema (supervisor cadastrando manualmente, atribuição de
-- colaborador da base, importação por planilha), nasce/continua `aprovado`.
-- Só `cadastrarFuncionarioPublico` (o formulário público, link ou portaria)
-- passa a gravar `pendente` explicitamente — ver lib/actions.ts.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table funcionarios
  add column if not exists status_credenciamento text not null default 'aprovado',
  add column if not exists decidido_por uuid references perfis(id) on delete set null,
  add column if not exists decidido_em timestamptz,
  add column if not exists motivo_negacao text;

create index if not exists funcionarios_pendentes
  on funcionarios (fornecedor_id) where status_credenciamento = 'pendente';

-- Mesmo procedimento de upgrade-veiculo-cadastrado-mensagem.sql: o CHECK de
-- `mensagens_agendadas.tipo` precisa listar cada tipo novo, senão o insert é
-- recusado pelo banco antes mesmo do código rodar.
alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'reforco_entrada', 'reforco_meio', 'reforco_fim',
    'credenciais_supervisor', 'confirmacao_escala', 'aviso_dia_evento',
    'boas_vindas_funcionario', 'aviso_montagem', 'aviso_desmontagem',
    'disparo_manual', 'veiculo_cadastrado', 'credenciamento_negado'
  ));

commit;

-- ROLLBACK
--   begin;
--     alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
--     alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
--       check (tipo in (
--         'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
--         'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
--         'reforco_entrada', 'reforco_meio', 'reforco_fim',
--         'credenciais_supervisor', 'confirmacao_escala', 'aviso_dia_evento',
--         'boas_vindas_funcionario', 'aviso_montagem', 'aviso_desmontagem',
--         'disparo_manual', 'veiculo_cadastrado'
--       ));
--     drop index if exists funcionarios_pendentes;
--     alter table funcionarios drop column if exists motivo_negacao;
--     alter table funcionarios drop column if exists decidido_em;
--     alter table funcionarios drop column if exists decidido_por;
--     alter table funcionarios drop column if exists status_credenciamento;
--   commit;
