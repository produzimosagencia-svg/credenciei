-- "Meus eventos" (pedido do Juan, 02/10/2026): encerrar um evento não derruba
-- mais o login do supervisor — ver o comentário em `acessosDoEvento`
-- (lib/actions.ts). Mas quem JÁ tinha sido travado por um evento fechado
-- ANTES desta mudança (ex.: Pontal Weekend, Henrique e Juliano, Ubu) continua
-- com `ativo = false` até alguém corrigir na mão. Este UPDATE é esse conserto,
-- uma vez só.
--
-- Só mexe em quem foi desativado POR UM EVENTO (`inativado_em_evento`
-- preenchido) — nunca em quem foi desativado manualmente por outro motivo
-- (`alternarAtivoUsuario` nunca grava essa coluna).
update perfis
set ativo = true, inativado_em_evento = null
where role = 'supervisor'
  and ativo = false
  and inativado_em_evento is not null;
