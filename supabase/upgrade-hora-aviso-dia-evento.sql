-- Horário do aviso do dia do evento (WhatsApp), POR EVENTO.
--
-- Até aqui era fixo em 07:00 no código (lib/mensagens.ts, HORA_AVISO_DIA_EVENTO).
-- No Pontal Weekend (25/09/2026) o Juan pediu 10h; o horário acertado à mão
-- na fila foi sobrescrito pela primeira ressincronização (toda edição de
-- equipe dispara uma) e a mensagem saiu às 7h. Guardado no evento, qualquer
-- ressincronização recalcula o mesmo horário.
--
-- Formato 'HH:MM', horário de Brasília. Nulo = padrão de sempre (07:00) —
-- nenhum evento existente muda de comportamento.
alter table eventos add column if not exists hora_aviso_dia_evento text;

comment on column eventos.hora_aviso_dia_evento is
  'HH:MM (Brasília) do aviso do dia do evento por WhatsApp. Nulo = padrão 07:00.';

-- Reversão, se precisar:
--     alter table eventos drop column if exists hora_aviso_dia_evento;
