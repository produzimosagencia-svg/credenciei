-- ═══════════════════════════════════════════════════════════════════════════
-- CONVITE POR WHATSAPP (18/10/2026)
--
-- O supervisor cola os telefones de quem quer na equipe; o sistema manda o link de cadastro da equipe no WhatsApp
-- e, 24 horas depois, lembra quem ainda não se cadastrou. Esta tabela guarda cada convite, para:
--   * não convidar o mesmo telefone duas vezes na mesma equipe;
--   * saber quem já se cadastrou (o telefone apareceu na equipe) e não lembrar essa pessoa;
--   * mostrar ao supervisor quem foi convidado, se a mensagem chegou e quem falta.
--
-- As mensagens saem pela fila de sempre (`mensagens_agendadas`, tipo disparo_manual), com os modelos
-- `convite_cadastro_equipe` e `lembrete_convite_equipe` (supabase/TEMPLATES-WHATSAPP.md, itens 11 e 12).
--
-- Pode rodar quantas vezes quiser. Antes de rodar, o botão "Convidar por WhatsApp" avisa que falta este SQL.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists convites_equipe (
  id                    uuid primary key default gen_random_uuid(),
  fornecedor_id         uuid not null references fornecedores(id) on delete cascade,
  evento_id             uuid not null references eventos(id) on delete cascade,
  -- DDD + número, só dígitos, sem o 55 (ex.: 27999990000).
  telefone              text not null,
  nome                  text,
  convidado_por         uuid references perfis(id) on delete set null,
  criado_em             timestamptz not null default now(),
  mensagem_id           uuid,
  lembrete_mensagem_id  uuid,
  lembrado_em           timestamptz,
  -- Preenchido quando o telefone aparece numa ficha desta equipe.
  cadastrado_em         timestamptz,
  funcionario_id        uuid references funcionarios(id) on delete set null,
  cancelado_em          timestamptz
);

create unique index if not exists convites_equipe_um_por_telefone on convites_equipe (fornecedor_id, telefone);
create index if not exists convites_equipe_lembrete on convites_equipe (criado_em) where lembrado_em is null and cadastrado_em is null and cancelado_em is null;
create index if not exists convites_equipe_evento on convites_equipe (evento_id);

-- Só o servidor (service role) lê e grava, como o resto do banco.
alter table convites_equipe enable row level security;

commit;

notify pgrst, 'reload schema';
