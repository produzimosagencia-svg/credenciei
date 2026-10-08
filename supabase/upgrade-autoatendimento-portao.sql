-- ════════════════════════════════════════════════════════════════════════════
-- Autoatendimento fora do horário da portaria (Registro de ponto pelo próprio
-- celular, com geolocalização obrigatória) — ligado por EVENTO, ativado pelo
-- operador na hora de ir embora
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Colunas em `eventos`, tudo desligado por padrão.
--
-- POR QUE (pedido do Juan, 08/10/2026, depois do VITAL): a equipe da portaria
-- (os operadores) trabalha até um horário combinado, mas colaboradores ficam
-- trabalhando depois disso, sem ninguém pra bater o QR deles na saída.
--
-- COMO FUNCIONA
--   1. O admin PARAMETRIZA em Editar evento: liga a função, define a hora de
--      início (`autoatendimento_inicio`, ex. 18:00) e a hora de fim
--      (`autoatendimento_fim`, ex. 07:00 do dia seguinte — cruza a meia-noite).
--      Isso sozinho NÃO libera nada — é só a régua.
--   2. O operador, na hora de ir embora, aperta "Estou indo embora" no /scan
--      (`autoatendimento_ativado_em`/`_por`). A partir daí, DENTRO da janela
--      configurada, a credencial do colaborador volta a ter o botão de
--      registrar entrada/saída (a geolocalização do PRÓPRIO colaborador passa
--      a ser OBRIGATÓRIA — ao contrário do autoatendimento de sempre, que é
--      tolerante).
--   3. "Cheguei" (`desativarAutoatendimentoPortao`) desarma na hora — útil se
--      alguém esquecer de desarmar e isso continuar visível no dia seguinte.
--      Mesmo sem apertar, a JANELA DE HORÁRIO é a trava final: fora dela, nada
--      funciona mesmo com `ativado_em` ainda preenchido (lib/autoatendimento.ts).
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table eventos
  add column if not exists autoatendimento_habilitado boolean not null default false,
  add column if not exists autoatendimento_inicio time,
  add column if not exists autoatendimento_fim time,
  add column if not exists autoatendimento_ativado_em timestamptz,
  add column if not exists autoatendimento_ativado_por uuid references perfis(id) on delete set null;

comment on column eventos.autoatendimento_habilitado is
  'true = este evento usa o autoatendimento fora do horário da portaria (precisa também de inicio/fim configurados).';
comment on column eventos.autoatendimento_ativado_em is
  'Preenchido quando o operador aperta "Estou indo embora"; null quando "Cheguei" ou nunca ativado. A janela de horário manda por cima disto.';

-- ROLLBACK
--   alter table eventos
--     drop column if exists autoatendimento_ativado_por,
--     drop column if exists autoatendimento_ativado_em,
--     drop column if exists autoatendimento_fim,
--     drop column if exists autoatendimento_inicio,
--     drop column if exists autoatendimento_habilitado;
