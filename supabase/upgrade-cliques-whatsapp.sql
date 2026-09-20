-- upgrade-cliques-whatsapp.sql
--
-- Guarda cada clique que sai da divulgação e entra no WhatsApp comercial.
--
-- Por que existe: a Credenciei não capta por formulário, vai direto pro
-- WhatsApp. Sem este registro, a UTM que vem do link da bio do Instagram
-- morre na barra de endereço e o comercial não sabe de onde veio ninguém.
-- A rota /wa grava a linha aqui e só então manda a pessoa pro WhatsApp.
--
-- O que NÃO fica aqui: nada que identifique a pessoa. Ela ainda não falou
-- com a gente, só clicou. Guardamos a origem do clique, não quem clicou.
--
-- Idempotente: pode rodar mais de uma vez. Não depende de nenhum outro upgrade.

create extension if not exists "pgcrypto";

create table if not exists public.cliques_whatsapp (
  id           uuid primary key default gen_random_uuid(),
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  referer      text,
  user_agent   text,
  criado_em    timestamptz not null default now()
);

alter table public.cliques_whatsapp add column if not exists utm_content text;
alter table public.cliques_whatsapp add column if not exists utm_term    text;
alter table public.cliques_whatsapp add column if not exists referer     text;
alter table public.cliques_whatsapp add column if not exists user_agent  text;

-- O uso real é "quantos cliques por origem, por período".
create index if not exists cliques_whatsapp_criado_em_idx on public.cliques_whatsapp (criado_em desc);
create index if not exists cliques_whatsapp_origem_idx    on public.cliques_whatsapp (utm_source, utm_medium, utm_campaign);

-- Mesmo contrato do resto do projeto: RLS ligado e SEM policy.
-- Ninguém lê nem escreve com a chave anon. Só o service role, pelo servidor.
alter table public.cliques_whatsapp enable row level security;

-- ROLLBACK (não roda por engano, descomente se precisar desfazer)
-- drop index if exists cliques_whatsapp_origem_idx;
-- drop index if exists cliques_whatsapp_criado_em_idx;
-- drop table if exists public.cliques_whatsapp;
