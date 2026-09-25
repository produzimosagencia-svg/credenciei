-- Um evento passa a poder ter mais de um dia principal (festival de duas
-- noites, cada uma com sua própria janela de entrada/saída). Este índice
-- garantia que só podia existir UM tipo='principal' por evento — removê-lo
-- sozinho não muda nenhum comportamento agora: nada no código desta versão
-- tenta criar uma segunda linha principal (isso só passa a existir numa
-- entrega futura, depois do Pontal Weekend). Ver supabase/upgrade-dias-de-trabalho.sql:56-58
-- pra a origem do índice.
drop index if exists jornada_dias_principal_unico;

-- Reversão, se precisar:
--     create unique index if not exists jornada_dias_principal_unico
--       on jornada_dias (evento_id) where tipo = 'principal';
