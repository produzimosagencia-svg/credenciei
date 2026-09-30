-- Identidade da pessoa (CPF) ≠ autorização no evento — e totem fixo por evento.
--
-- Pedido do Juan (29/09/2026): reconhecer o rosto é uma pergunta ("quem é
-- essa pessoa?"); autorizar a entrada é outra ("ela pode entrar NESTE
-- evento?"). Hoje `validarLeituraFacial` só enxerga a galeria do evento
-- atual — se a pessoa não está cadastrada ALI, a resposta é sempre "não
-- identificado", mesmo quando ela está credenciada num evento vizinho, da
-- MESMA organização. Esta migração dá o dado que falta pra distinguir os
-- dois casos, sem tocar em como o reconhecimento do dia a dia já funciona.
--
-- Junto: cada totem físico passa a poder ser preso a UM evento (e um nome
-- de portão) — hoje ele é preso só à organização, e se ela roda dois
-- eventos no mesmo dia, o mesmo tablet mostra os dois pra escolher.

begin;

-- O CPF direto na linha (não só via funcionário) — é o que permite achar
-- "este CPF, em qualquer outro evento da mesma organização" sem um JOIN
-- pesado a cada leitura da câmera. Nulo em linhas antigas: a busca ampla
-- (2ª etapa, só quando a 1ª não acha ninguém) simplesmente não vê essas
-- linhas até a pessoa recadastrar — nunca quebra a busca de hoje, que
-- continua só por evento_id.
alter table biometria_templates add column if not exists cpf text;
create index if not exists biometria_templates_por_cpf on biometria_templates (cpf);

-- Totem fixo: quando preenchido, o tablet só enxerga ESTE evento (e mostra
-- o nome do portão em vez de um seletor). Nulo pra qualquer conta que não
-- é totem, e nulo também pros totens já criados antes desta migração —
-- continuam escolhendo entre os eventos da organização, como sempre.
alter table perfis add column if not exists evento_fixo_id uuid references eventos(id) on delete set null;
alter table perfis add column if not exists portao_nome text;

commit;
