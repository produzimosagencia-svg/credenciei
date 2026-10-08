-- ════════════════════════════════════════════════════════════════════════════
-- Tutorial guiado ligado/desligado POR EVENTO
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Uma coluna em `eventos`, nasce LIGADA (todo evento
-- existente continua exatamente como está).
--
-- Pedido do Juan (08/10/2026): em alguns eventos o tutorial atrapalha mais do
-- que ajuda (equipe grande, já treinada, com pressa) — "desliga ou liga se eu
-- quero essa função nesse evento". O interruptor fica em Editar evento.
--
-- Some o balão guiado nas telas do evento (Evento, Editar evento, setor,
-- Scanner, credencial da equipe); não mexe no histórico de quem já viu
-- (`credenciei:tutorial:...`), só evita abrir de novo enquanto desligado.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table eventos
  add column if not exists tutorial_habilitado boolean not null default true;

comment on column eventos.tutorial_habilitado is
  'false = o tutorial guiado não abre sozinho nas telas deste evento (o botão "Ver tutorial" também some).';

-- ROLLBACK
--   alter table eventos drop column if exists tutorial_habilitado;
