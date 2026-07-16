-- ============================================================
-- UPGRADE: melhorias da reunião com o cliente (15/07/2026)
--
-- 1) Trava de ativação: cadastro fica livre acima do estimado, mas só
--    funcionários ATIVADOS (dentro do teto) trabalham/recebem.
-- 2) Trava opcional de CPFs pré-autorizados por setor.
-- 3) Mensagem pré-evento personalizável (confirmação de escala).
-- 4) Registro manual pelo supervisor (CPF + foto) — flag de auditoria.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- 1) Ativação de funcionário (todos os existentes continuam ativos)
alter table funcionarios add column if not exists ativo boolean not null default true;

-- 2) Trava opcional por setor: lista de CPFs autorizados (um por linha,
--    só dígitos). NULL ou vazio = trava desligada, qualquer um se cadastra.
alter table fornecedores add column if not exists cpfs_autorizados text;

-- 3) Mensagem pré-evento (confirmação de escala + instruções do evento)
alter table eventos add column if not exists msg_pre_evento_envio timestamptz;
alter table eventos add column if not exists msg_pre_evento_instrucoes text;

-- 4) Auditoria de registro manual feito pelo supervisor
alter table registros add column if not exists registro_manual boolean not null default false;

-- Novo tipo de mensagem agendada: confirmacao_escala
alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'reforco_entrada', 'reforco_meio', 'reforco_fim',
    'credenciais_supervisor',
    'confirmacao_escala'
  ));
