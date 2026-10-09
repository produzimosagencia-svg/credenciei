-- upgrade-cliques-links.sql
--
-- Guarda cada clique no Instagram da Credenciei e no site (credenciei.com.br) que sai de dentro do sistema
-- (pedido do Juan, 09/10/2026: "quantas pessoas clicaram no ícone que encaminha para o nosso instagram ... e quem
-- clica pra ir no nosso site"). A rota /ir grava a linha aqui e só então manda a pessoa pro destino.
--
-- Diferente de `cliques_whatsapp` (lead que ainda não falou com a gente), aqui o clique vem de quem JÁ está no
-- sistema — o colaborador na credencial dele, quem se cadastra pelo link do fornecedor. Por isso guarda o evento,
-- o setor e, quando sai da credencial, a pessoa: é o "quem clica" do pedido.
--
-- Idempotente: pode rodar mais de uma vez. Não depende de nenhum outro upgrade.

create extension if not exists "pgcrypto";

create table if not exists public.cliques_links (
  id             uuid primary key default gen_random_uuid(),
  destino        text not null,              -- instagram | site
  origem         text not null,              -- landing | credencial | formulario | pdf
  evento_id      uuid references public.eventos(id) on delete set null,
  fornecedor_id  uuid references public.fornecedores(id) on delete set null,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  referer        text,
  user_agent     text,
  criado_em      timestamptz not null default now()
);

create index if not exists cliques_links_criado_em_idx on public.cliques_links (criado_em desc);
create index if not exists cliques_links_destino_idx   on public.cliques_links (destino, origem);
create index if not exists cliques_links_evento_idx    on public.cliques_links (evento_id);

-- Mesmo contrato do resto do projeto: RLS ligado e SEM policy. Só o service role, pelo servidor.
alter table public.cliques_links enable row level security;

notify pgrst, 'reload schema';

-- ROLLBACK (não roda por engano, descomente se precisar desfazer)
-- drop table if exists public.cliques_links;
