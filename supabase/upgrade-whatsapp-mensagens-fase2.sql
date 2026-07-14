-- ============================================================
-- UPGRADE: novos tipos de mensagem WhatsApp (fase 2)
--
-- Roda DEPOIS de upgrade-whatsapp-lembretes.sql. Adiciona:
--   1) credenciais_supervisor — mensagem imediata ao criar um supervisor,
--      com login/senha (não está mais ligada a um funcionário, e sim a um
--      perfil de supervisor).
--   2) alerta_supervisor_entrada/meio/fim — aviso condicional ao supervisor
--      quando o funcionário NÃO bate o ponto até o horário limite. A
--      condição ("ainda sem registro?") é checada em tempo de envio pelo
--      worker, não no momento do agendamento.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- funcionario_id deixa de ser obrigatório: credenciais_supervisor não tem
-- funcionário associado, só o perfil do supervisor.
alter table mensagens_agendadas alter column funcionario_id drop not null;

alter table mensagens_agendadas add column if not exists perfil_id uuid references perfis(id) on delete cascade;
alter table mensagens_agendadas add column if not exists condicao text;

create index if not exists mensagens_agendadas_perfil_idx on mensagens_agendadas(perfil_id);

-- Amplia os tipos permitidos
alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'credenciais_supervisor'
  ));

-- Dedupe de credenciais_supervisor: um perfil de supervisor só recebe as
-- credenciais uma vez. Constraint só "pega" linhas com perfil_id preenchido
-- (NULL nunca conflita com NULL em UNIQUE do Postgres) — não afeta as demais
-- linhas, que continuam usando a constraint (evento_id, funcionario_id, tipo)
-- já criada em upgrade-whatsapp-lembretes.sql.
alter table mensagens_agendadas add constraint mensagens_agendadas_perfil_tipo_key unique (perfil_id, tipo);
