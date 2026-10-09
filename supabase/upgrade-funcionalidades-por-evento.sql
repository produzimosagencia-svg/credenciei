-- ════════════════════════════════════════════════════════════════════════════
-- Funcionalidades POR EVENTO (Configurações dentro do evento)
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Pedido do Juan (09/10/2026): o botão "Configurações"
-- dentro do evento, com as mesmas opções de Configurações → Funcionalidades,
-- valendo SÓ para aquele evento.
--
-- `null` (o padrão) = o evento segue a organização, como sempre. Salvo na tela
-- do evento, vira um objeto com as 6 chaves (mesmos nomes das colunas de
-- `organizacoes`), e o evento passa a usar os valores dele.
--
-- Rode no SQL Editor do Supabase (uma vez):

alter table eventos
  add column if not exists funcionalidades jsonb;

comment on column eventos.funcionalidades is
  'null = segue a organização. Objeto = as funcionalidades deste evento (subeventos_habilitado, trava_cota_habilitada, aviso_uniforme_habilitado, escala_por_dia_habilitada, encarregados_habilitado, area_no_scanner_habilitada).';

-- Reverter:
--     alter table eventos drop column if exists funcionalidades;
