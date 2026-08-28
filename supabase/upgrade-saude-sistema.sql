-- ============================================================
-- Saúde do sistema — o aviso de que o WhatsApp caiu
--
-- A instância da Evolution desconecta sozinha (celular desligado, sessão
-- derrubada, número banido) e, quando isso acontece, a fila simplesmente para:
-- ninguém recebe lembrete, e o produtor só descobre no dia do evento, quando a
-- equipe não apareceu.
--
-- O processamento da fila JÁ consulta o estado da instância a cada lote. O que
-- faltava era guardar essa resposta em algum lugar que a tela pudesse ler —
-- checar ao vivo no Painel penduraria a página por até dez segundos quando a
-- VPS estivesse fora do ar, que é exatamente a hora em que se quer ver o aviso.
--
-- Uma tabela chave/valor porque o que se guarda aqui é sempre "o último estado
-- conhecido de X", nunca histórico: uma linha por assunto, sobrescrita.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

create table if not exists sistema_estado (
  chave         text primary key,
  valor         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table sistema_estado enable row level security;
c