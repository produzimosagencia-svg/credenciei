-- ============================================================
-- Supervisor entra com CPF
--
-- Antes era nome de usuário ("joao.bar"), inventado pelo organizador na hora
-- do cadastro. Dois problemas: o organizador precisava lembrar qual nome tinha
-- dado, e o supervisor precisava decorar algo que não é dele.
--
-- O CPF resolve os dois: a pessoa já sabe o dela de cor, e o organizador não
-- inventa nada. A senha passa a ser fixa (123456) — decisão do cliente, com o
-- custo declarado: quem souber o CPF de um supervisor entra como ele, e o CPF
-- da equipe é visível dentro do próprio sistema.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table perfis add column if not exists cpf text;

-- Um CPF não pode ser dois supervisores: o login ficaria ambíguo.
create unique index if not exists perfis_cpf_unico on perfis (cpf) where cpf is not null;

create index if not exists perfis_cpf_busca on perfis (cpf);
