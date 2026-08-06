-- ============================================================
-- Base regional de freelancers
--
-- A base de funcionários deixa de ser só um cache de CPF e passa a servir de
-- banco de gente disponível na região: o admin busca por cidade e função,
-- acha quem já trabalhou em outros eventos e chama a pessoa direto.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- Cidade onde a pessoa MORA (não onde é o evento). É o filtro principal da
-- busca: enquanto a operação for estadual isso já separa quem consegue chegar
-- ao local de quem não consegue.
alter table funcionarios add column if not exists cidade text;

-- Índice de busca por cidade. `lower()` porque a pessoa digita à mão no
-- formulário público — "Vitória", "vitoria" e "VITÓRIA" precisam cair juntas.
create index if not exists funcionarios_cidade_idx on funcionarios (lower(cidade));

-- Busca por nome na base inteira: sem isto, procurar "ana" varre a tabela
-- toda a cada tecla na tela de Encontrar funcionários.
create index if not exists funcionarios_nome_busca_idx on funcionarios (lower(nome));
