-- Biometria: DOIS jeitos de bater, cada um ligável por evento.
--
-- Pedido do Juan (27/09/2026): a batida por biometria pode ser
--   - "totem": um aparelho fixo no portão (tablet/celular), operado por
--     quem credencia — é o `/scan` que já existe, com o rosto no lugar do QR.
--   - "autoatendimento": o PRÓPRIO funcionário, pelo celular dele, na
--     credencial — sem ninguém segurando o aparelho.
--
-- Os dois podem estar ligados ao mesmo tempo. `biometria_totem` nasce
-- LIGADO pra quem já configurou biometria continuar exatamente como estava
-- (o /scan já usava rosto); `biometria_autoatendimento` nasce DESLIGADO —
-- é o modo novo, e liga quando o produtor decidir.

begin;

alter table eventos
  add column if not exists biometria_totem boolean not null default true;
alter table eventos
  add column if not exists biometria_autoatendimento boolean not null default false;

commit;
