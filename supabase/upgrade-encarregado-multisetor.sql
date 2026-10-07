-- ════════════════════════════════════════════════════════════════════════════
-- Encarregado em VÁRIOS setores — um cadastro, uma mensagem
-- ════════════════════════════════════════════════════════════════════════════
-- Para quem JÁ rodou upgrade-encarregado.sql: a primeira versão limitava cada
-- pessoa da equipe a UM setor (`funcionario_id` único). Agora a mesma pessoa
-- pode ser Encarregada de vários setores do supervisor, e o limite passa a ser
-- por PAR (pessoa + setor). Aditiva e idempotente — rodar no SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table encarregados_setor drop constraint if exists encarregados_setor_funcionario_id_key;

create unique index if not exists encarregados_setor_funcionario_fornecedor
  on encarregados_setor (funcionario_id, fornecedor_id);

commit;
