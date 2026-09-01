-- ════════════════════════════════════════════════════════════════════════════
-- Auto-atendimento no dia principal — os dois fluxos coexistem por evento
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e reversível. Nenhuma tela existente lê esta coluna, e o valor
-- padrão (false) faz todos os eventos de hoje continuarem exatamente como
-- estão — só o operador registra entrada/saída no dia principal.
--
-- ─── O PROBLEMA ─────────────────────────────────────────────────────────────
--
-- O check-in autônomo (QR fixo da portaria + identificação por CPF +
-- localização, sem selfie) foi construído pra montagem/desmontagem, onde
-- sempre vale — não existe operador de plantão o tempo todo nesses dias.
--
-- No dia principal, o padrão sempre foi o oposto: um operador lê o crachá de
-- cada pessoa (Fluxo 1). Pedido explícito: em show grande, com fila,
-- oferecer os DOIS caminhos ao mesmo tempo — quem quiser continua pelo
-- crachá, quem preferir usa o próprio celular. O admin decide, por evento,
-- se quer ligar essa opção extra.
--
-- ─── INDEPENDE DE `batida_livre` ────────────────────────────────────────────
--
-- Uma coisa é QUANDO a entrada/saída é aceita (com ou sem horário fixo —
-- `batida_livre`); outra é QUEM pode fazer o registro (só o operador, ou
-- também a própria pessoa — `checkin_autonomo`). Esta coluna não muda regra
-- de horário nenhuma: o auto-atendimento, quando ligado, respeita a MESMA
-- janela que já vale pro scanner do operador.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table eventos
  add column if not exists checkin_autonomo boolean not null default false;

comment on column eventos.checkin_autonomo is
  'Quando true, entrada e saída do DIA PRINCIPAL também podem ser registradas '
  'pela própria pessoa (QR fixo da portaria + CPF + localização, sem selfie), '
  'em paralelo ao crachá lido por um operador — nenhum caminho substitui o '
  'outro. Nos dias de montagem/desmontagem o auto-atendimento já é sempre o '
  'padrão, com ou sem esta coluna.';

commit;

-- ROLLBACK
--   begin;
--     alter table eventos drop column if exists checkin_autonomo;
--   commit;
