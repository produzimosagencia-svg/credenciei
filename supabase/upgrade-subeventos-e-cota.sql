-- Vital: evento mãe com subeventos, fornecedor por subevento, trava de cota.
-- Ver plano em conversa 30/09/2026 — itens 1-3 do pedido do Vital.

-- Liga/desliga por organização (Configurações → Funcionalidade do Sistema).
-- Nasce desligado: nenhum cliente existente muda de comportamento sozinho.
alter table organizacoes add column if not exists subeventos_habilitado boolean not null default false;
alter table organizacoes add column if not exists trava_cota_habilitada boolean not null default false;
alter table organizacoes add column if not exists aviso_uniforme_habilitado boolean not null default false;

-- Item 4 (aviso de uniforme/identificação) — texto livre por evento, mostrado
-- como banner permanente na credencial quando preenchido.
alter table eventos add column if not exists aviso_uniforme_texto text;

-- Item 5 ("entrada em qualquer horário") — versão por-fornecedor do
-- `batida_livre` que já existe por evento inteiro (bandas, postura e afins).
-- Nasce desligado: nenhum fornecedor existente muda de comportamento.
alter table fornecedores add column if not exists entrada_qualquer_horario boolean not null default false;

-- Evento mãe → subeventos (portões/categorias de acesso do MESMO evento,
-- sem data/local próprios — herdam tudo do evento "mãe").
create table if not exists subeventos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now()
);
create index if not exists subeventos_por_evento on subeventos(evento_id);
alter table subeventos enable row level security;

/*
 * Hierarquia corrigida (30/09/2026, teste ao vivo do Juan no Vital):
 * Evento → Subevento → Fornecedor, uma árvore simples — não a "escala" N:N
 * com cota própria da primeira versão (removida daqui antes de qualquer
 * banco real chegar a ter a tabela `fornecedor_subeventos`). Um fornecedor
 * pertence a NO MÁXIMO um subevento, do mesmo jeito que já pertence a um
 * evento. Cota continua sendo só `fornecedores.quantidade_estimada`.
 */

-- Cada evento decide, por si, se usa subeventos — visível em Editar evento
-- só quando a organização já liberou "Subeventos" em Configurações.
alter table eventos add column if not exists tem_subeventos boolean not null default false;

-- Fornecedor pertence a um subevento — null = evento sem subevento (ou
-- fornecedor ainda não movido pra dentro de um).
alter table fornecedores add column if not exists subevento_id uuid references subeventos(id) on delete set null;
create index if not exists fornecedores_por_subevento on fornecedores(subevento_id);

-- Funcionário pertence a um subevento — copiado do fornecedor dele no
-- cadastro; null = evento sem subeventos (comportamento de hoje, sem
-- mudança nenhuma).
alter table funcionarios add column if not exists subevento_id uuid references subeventos(id) on delete set null;
create index if not exists funcionarios_por_subevento on funcionarios(subevento_id);
