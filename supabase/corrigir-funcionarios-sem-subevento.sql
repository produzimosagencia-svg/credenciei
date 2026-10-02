-- Conserto retroativo (02/10/2026): todo funcionário/supervisor cadastrado
-- ANTES do fix de hoje (crachaNoEvento, criarFuncionario,
-- atribuirColaboradorAoEvento) ficou com `subevento_id` em branco, mesmo
-- pertencendo a um fornecedor que já tem subevento definido — e por isso o
-- scanner com área configurada barra essas pessoas como "ÁREA DIFERENTE",
-- mesmo estando no fornecedor certo (achado ao vivo: credencial do
-- supervisor Gabriel Valiati, Arquibancada).
--
-- Este UPDATE iguala `funcionarios.subevento_id` ao `subevento_id` do
-- FORNECEDOR de cada um, pra todo mundo que estiver divergente ou em
-- branco. Seguro rodar quantas vezes precisar — não mexe em quem já está
-- certo, e não mexe em fornecedor sem subevento (evento sem subeventos
-- continua do jeito que é).
update funcionarios f
set subevento_id = fo.subevento_id
from fornecedores fo
where f.fornecedor_id = fo.id
  and fo.subevento_id is not null
  and (f.subevento_id is null or f.subevento_id <> fo.subevento_id);
