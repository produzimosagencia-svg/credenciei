-- ============================================================
-- API oficial do WhatsApp (Meta Cloud API) — eventos recebidos
--
-- Guarda o que a Meta manda no webhook: mensagens que CHEGARAM (a matéria-prima
-- do chat) e o STATUS das que saíram (enviada, entregue, lida, falhou).
--
-- O status é ganho novo: hoje o sistema só sabe que a API aceitou a mensagem,
-- não que ela chegou no celular de alguém. Com isso dá para responder "o fulano
-- recebeu?" com um dado em vez de um palpite.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

create table if not exists whatsapp_eventos (
  id            uuid primary key default gen_random_uuid(),
  -- 'recebida' = mensagem de alguém para nós; 'status' = retorno de uma que enviamos.
  direcao       text not null check (direcao in ('recebida', 'status')),
  wa_message_id text,
  telefone      text,
  nome_contato  text,
  -- Em 'recebida' é o tipo (text, image…); em 'status' é o estado (delivered…).
  tipo          text not null,
  texto         text,
  ocorrido_em   timestamptz not null default now(),
  -- O payload cru. A Meta muda o formato sem avisar, e o que hoje é ruído pode
  -- ser a única prova de um problema amanhã.
  bruto         jsonb,
  criado_em     timestamptz not null default now()
);

/*
 * A Meta REENVIA o mesmo evento quando não recebe 200 rápido o bastante — e às
 * vezes mesmo quando recebe. Sem esta trava, uma conversa apareceria duplicada
 * no chat toda vez que a rede oscilasse.
 */
create unique index if not exists whatsapp_eventos_dedupe
  on whatsapp_eventos (wa_message_id, direcao, tipo)
  where wa_message_id is not null;

-- A pergunta do chat: "as mensagens deste número, na ordem".
create index if not exists whatsapp_eventos_conversa_idx
  on whatsapp_eventos (telefone, ocorrido_em desc);

alter table whatsapp_eventos enable row level security;
