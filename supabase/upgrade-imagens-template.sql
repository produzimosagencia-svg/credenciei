-- upgrade-imagens-template.sql
--
-- Bucket das imagens de cabeçalho dos templates do WhatsApp.
--
-- Por que existe: template aprovado com cabeçalho de imagem exige a URL da
-- imagem em TODO envio, e quem baixa o arquivo é o servidor da Meta, não o
-- navegador de quem dispara. Sem um lugar pra hospedar, o disparo dependia de
-- alguém ter a arte publicada em algum site.
--
-- PRIVADO, como todos os buckets deste projeto. A Meta não precisa de bucket
-- público: ela acessa por URL assinada, que é https, funciona sem login e tem
-- prazo. Bucket público com caminho previsível deixaria a arte de qualquer
-- cliente aberta pra quem adivinhasse o endereço.
--
-- Idempotente: pode rodar mais de uma vez.

begin;

insert into storage.buckets (id, name, public)
values ('templates', 'templates', false)
on conflict (id) do nothing;

commit;

-- ROLLBACK
--   begin;
--     delete from storage.objects where bucket_id = 'templates';
--     delete from storage.buckets where id = 'templates';
--   commit;
