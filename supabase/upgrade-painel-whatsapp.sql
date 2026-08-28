-- ============================================================
-- Painel do WhatsApp — mensagens enviadas no mesmo lugar das recebidas
--
-- O chat precisa mostrar os DOIS lados da conversa. As recebidas já chegam
-- pelo webhook em `whatsapp_eventos`; as enviadas viviam em
-- `mensagens_agendadas`, e o TEXTO delas nem era guardado — ele é renderizado
-- no instante do envio, a partir do template com dados frescos do banco.
--
-- Isso era certo enquanto ninguém precisava reler a conversa. Para o chat,
-- não serve: sem o texto gravado, a tela mostraria "boas_vindas_funcionario"
-- no lugar da mensagem que a pessoa recebeu.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table whatsapp_eventos drop constraint if exists whatsapp_eventos_direcao_check;
alter table whatsapp_eventos add constraint whatsapp_eventos_direcao_check
  check (direcao in ('recebida', 'enviada', 'status'));

-- De qual evento/pessoa saiu a mensagem, quando o disparo foi do sistema.
-- Nulo em resposta manual pelo chat, que não pertence a evento nenhum.
alter table whatsapp_eventos add column if not exists evento_id uuid references eventos(id) on delete set null;
alter table whatsapp_eventos add column if not exists funcionario_id uuid references funcionarios(id) on delete set null;

-- A lista de conversas ordena por "última mensagem de cada número".
create index if not exists whatsapp_eventos_conversas_idx
  on whatsapp_eventos (telefone, criado_em desc)
  where direcao in ('recebida', 'enviada');

-- ─── Configuração dos fluxos automáticos ────────────────────────────────────
/*
 * Guardado em `sistema_estado` (chave/valor) em vez de tabela nova: é sempre
 * "o último estado conhecido de X", uma linha por assunto, sobrescrita. Uma
 * tabela com uma linha por tipo de mensagem seria a mesma coisa com mais
 * cerimônia — e o painel edita tudo de uma vez, nunca um tipo isolado.
 */
create table if not exists sistema_estado (
  chave         text primary key,
  valor         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table sistema_estado enable row level security;

-- ─── Disparo manual entra na fila como os outros ────────────────────────────
/*
 * Vai pela MESMA fila dos automáticos de propósito: é ela que tem espaçamento
 * entre envios, retry com backoff e as travas contra mensagem errada. Um laço
 * de mil chamadas na requisição do painel ignoraria tudo isso — e estouraria
 * o tempo da função no meio do disparo, sem ninguém saber onde parou.
 */
alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in (
    'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
    'reforco_entrada', 'reforco_meio', 'reforco_fim',
    'credenciais_supervisor', 'confirmacao_escala', 'aviso_dia_evento',
    'boas_vindas_funcionario', 'aviso_montagem', 'aviso_desmontagem',
    'disparo_manual'
  ));
