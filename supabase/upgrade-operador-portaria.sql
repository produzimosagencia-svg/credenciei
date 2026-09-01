-- ════════════════════════════════════════════════════════════════════════════
-- Operador de portão — perfil só de leitura/scanner
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e reversível. Só troca a lista de valores aceitos em `perfis.role`
-- (é um CHECK, não um enum do Postgres — nada a recriar). Nenhum perfil
-- existente muda de papel.
--
-- Quem opera fisicamente o credenciamento (ex.: no portão do evento) precisa
-- ler QR Code e registrar ponto manual, mas NÃO deve receber a senha de um
-- admin nem enxergar nada de gerenciamento (editar evento, equipe, valores).
-- `lib/permissions.ts` (`podeEscanear`) é quem de fato define o que este
-- papel pode fazer — este arquivo só abre espaço no banco para ele existir.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table perfis drop constraint if exists perfis_role_check;
alter table perfis add constraint perfis_role_check
  check (role in ('master', 'admin', 'gerente', 'supervisor', 'cliente', 'operador_portao'));

commit;

-- ROLLBACK
--   begin;
--     -- Só reverte se não houver nenhum perfil com role = 'operador_portao'.
--     alter table perfis drop constraint if exists perfis_role_check;
--     alter table perfis add constraint perfis_role_check
--       check (role in ('master', 'admin', 'gerente', 'supervisor', 'cliente'));
--   commit;
