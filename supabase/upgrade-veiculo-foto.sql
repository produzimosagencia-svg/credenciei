-- ════════════════════════════════════════════════════════════════════════════
-- Foto do veículo — opcional, no cadastro e depois
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Só acrescenta uma coluna em `veiculos`.
--
-- POR QUE
--
-- Pedido do Juan (03/09/2026): a portaria confere a placa na lista, mas placa
-- é texto — a foto é o que resolve o caso de dúvida no portão (é ESTE caminhão
-- mesmo?). Opcional de propósito: quem cadastra às pressas, na chegada do
-- veículo, não pode ser barrado por não ter foto na hora. Editável depois pelo
-- mesmo motivo — a foto costuma vir DEPOIS do cadastro, quando o veículo já
-- está na frente da pessoa.
--
-- `foto_path` guarda o CAMINHO no bucket `presencas` (o mesmo já usado por
-- foto de perfil, selfie de presença e logo de organização), não a imagem nem
-- uma URL. O bucket é privado: a URL é assinada na hora de exibir e expira —
-- é o mesmo tratamento que a selfie de ponto já recebe, e o que impede que um
-- link vazado dê acesso permanente.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table veiculos add column if not exists foto_path text;

commit;

-- ROLLBACK
--   begin;
--     alter table veiculos drop column if exists foto_path;
--   commit;
