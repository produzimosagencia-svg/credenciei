-- ============================================================
-- UPGRADE: RLS lockdown (segurança para venda / multi-tenant)
--
-- Liga Row Level Security em TODAS as tabelas do app. Sem políticas
-- permissivas, isso significa que os papéis públicos (anon) e de usuário
-- logado (authenticated) NÃO conseguem ler nem escrever nada direto pela
-- API do Supabase. Todo o acesso passa pela SERVICE ROLE, que só existe no
-- servidor (Next.js) — e o servidor aplica o isolamento por organização.
--
-- Antes desta mudança, a chave pública (anon), que fica no bundle do site,
-- conseguia ler/escrever todas as tabelas. Isto fecha esse buraco.
--
-- Rodar no SQL Editor do Supabase (dashboard), DEPOIS de:
--   1) upgrade-papeis-setores-qr.sql
--   2) upgrade-multi-organizacao.sql
-- Idempotente.
--
-- IMPORTANTE: o código já foi ajustado para acessar o banco apenas pela
-- service role (leituras e escritas no servidor + server actions do scanner
-- e do formulário público). Não rode este SQL numa versão antiga do código,
-- senão as telas quebram.
-- ============================================================

alter table organizacoes       enable row level security;
alter table perfis             enable row level security;
alter table eventos            enable row level security;
alter table fornecedores       enable row level security;
alter table funcionarios       enable row level security;
alter table registros          enable row level security;
alter table setores            enable row level security;
alter table supervisor_eventos enable row level security;

-- Sem CREATE POLICY: RLS ligado + zero políticas = acesso negado para anon e
-- authenticated. A service role (usada só no servidor) ignora o RLS por padrão.
--
-- Fase futura (defesa em profundidade, opcional): criar políticas por
-- organizacao_id para o papel authenticated, caso algum dia o cliente passe a
-- acessar o Supabase direto do navegador. Hoje isso não acontece.
