-- ════════════════════════════════════════════════════════════════════════════
-- Selecionar a área no leitor de QR Code — funcionalidade por organização
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva e reversível. Uma coluna em `organizacoes`, desligada por padrão.
--
-- Desligada: o leitor só abre a câmera e registra quem entra (sem "Qual área você
-- vai atuar?" e sem recusar com "ÁREA DIFERENTE"). Ligada: o comportamento por
-- subevento de sempre. Liga/desliga em Configurações → Funcionalidades.
--
-- Sem rodar este arquivo o sistema já se comporta como DESLIGADO (é o padrão);
-- só é preciso rodá-lo para poder LIGAR.
--
-- Reverter: alter table organizacoes drop column if exists area_no_scanner_habilitada;

alter table organizacoes
  add column if not exists area_no_scanner_habilitada boolean not null default false;
