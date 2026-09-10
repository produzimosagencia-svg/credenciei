-- ════════════════════════════════════════════════════════════════════════════
-- Os sócios viram master — acesso ao Backlog Operacional com nome próprio
-- ════════════════════════════════════════════════════════════════════════════
-- Só DADO, nenhuma estrutura muda. Reversível (bloco no fim).
--
-- POR QUE ISTO EXISTE
--
-- O Backlog é master-only (ver `podeGerenciarBacklog` em lib/permissions.ts).
-- O Juan pediu em 09/09/2026 que três pessoas — ele, Guilherme Silva e Gabriel
-- Valiati — tivessem acesso. Só que "master" era, na prática, UMA conta
-- compartilhada (master@credenciei.com): o histórico do Backlog e a auditoria
-- diriam "Master" em vez do nome de quem mexeu.
--
-- Entre criar uma permissão por pessoa (migração + tela nova) e promover os
-- sócios a master, ele escolheu promover, ciente de que master enxerga e apaga
-- tudo, em todas as organizações. Está registrado aqui porque conceder acesso
-- irrestrito é o tipo de mudança que precisa deixar rastro escrito.
--
-- QUEM ENTRA
--
--   Juan Muzy de Oliveira   juan@credenciei.com                supervisor → master
--   Gabriel Valiati         14682085786@supervisor.credenciei  suporte    → master
--
-- Guilherme Silva NÃO entra: ele não tem perfil no sistema, e o Juan preferiu
-- não criar agora (09/09/2026). Quando criar, é só mais um UPDATE igual.
--
-- ORGANIZAÇÃO VAI A NULO
--
-- O perfil do Juan estava preso à organização d2782d06 (era supervisor dela).
-- Master não pertence a organização nenhuma — o contexto dele é a plataforma
-- inteira, e é isso que o AppShell mostra no topo ("Plataforma"). Deixar o
-- vínculo antigo faria um master carregar um escopo que ele não tem mais.
-- ════════════════════════════════════════════════════════════════════════════

begin;

update perfis
   set role = 'master',
       organizacao_id = null,
       fornecedor_id = null,
       acesso_expira_em = null
 where id in (
   'b4816012-ac08-4ef2-892a-b695945555c5',  -- Juan Muzy de Oliveira
   'c358bd94-ddc8-4df4-a2b3-2e082d9a2fe7'   -- Gabriel Valiati
 );

commit;

-- ROLLBACK — devolve exatamente o que cada um era antes (lido da produção
-- em 09/09/2026, antes do update).
--   begin;
--     update perfis
--        set role = 'supervisor',
--            organizacao_id = 'd2782d06-d6e9-498d-9e01-6628aae8ffe5'
--      where id = 'b4816012-ac08-4ef2-892a-b695945555c5';
--     update perfis
--        set role = 'suporte'
--      where id = 'c358bd94-ddc8-4df4-a2b3-2e082d9a2fe7';
--   commit;
