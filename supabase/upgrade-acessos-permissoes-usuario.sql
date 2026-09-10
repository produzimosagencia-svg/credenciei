-- ════════════════════════════════════════════════════════════════════════════
-- Acessos — permissões por USUÁRIO (liga/desliga função no criar/editar acesso)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Uma coluna nova em `perfis`. Nada existente muda.
--
-- POR QUE UMA COLUNA, E NÃO UMA TABELA
--
-- É sempre lido junto do perfil (uma linha, pela PK, em `getPerfil`), nunca
-- consultado sozinho nem agregado. `jsonb` na própria linha evita um segundo
-- SELECT em toda requisição do sistema. A tabela `permissoes_organizacao`
-- (exceção por ORGANIZAÇÃO) continua existindo e é outra camada — ver
-- `resolver()` em lib/permissions.ts.
--
-- FORMATO
--
--   { "<chave>": true|false, ... }
--
-- `<chave>` é a mesma de `CAPACIDADES` em lib/permissions.ts (ex.: "escanear",
-- "acompanhar", "gerenciar_veiculos"). Valor presente = decisão explícita
-- deste acesso; chave ausente = cai na regra de baixo (organização, depois
-- padrão do código). `{}` = exatamente o comportamento de hoje.
--
-- MASTER NUNCA É AFETADO — `resolver()` corta o master antes de olhar isto,
-- pelo mesmo motivo de sempre (uma tela de permissões não pode se trancar).
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table perfis
  add column if not exists permissoes_usuario jsonb not null default '{}'::jsonb;

commit;

-- ROLLBACK
--   begin;
--     alter table perfis drop column if exists permissoes_usuario;
--   commit;
