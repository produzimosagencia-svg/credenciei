-- Biometria facial — segundo método de identificação, ao LADO do QR Code.
--
-- Pedido do Juan (27/09/2026): o QR Code NUNCA é desativado. A biometria
-- entra como uma nova forma de dizer "quem é esta pessoa" (identificação);
-- a autorização (evento certo, aprovado, ativo, não bloqueado, já
-- entrou?) continua sendo a MESMA função que o QR já usa — ver
-- `autorizarPresenca` em lib/actions.ts. As tabelas abaixo só guardam o
-- necessário pra identificação; nenhuma delas participa da autorização.
--
-- Isolamento por evento: o template é preso ao EVENTO (evento_id direto na
-- tabela, não só via funcionário), então o rosto cadastrado no evento A
-- nunca é comparado contra o evento B, mesmo que seja a mesma pessoa.
--
-- O que NÃO está aqui (ver docs/ do estudo em c:\Dev\credenciei-biometria):
-- liveness certificado, totem, câmeras, hub local, pgvector — tudo isso é
-- fase futura. Esta migração cobre só o necessário pro MVP: cadastro pelo
-- portão (staff), reconhecimento no scanner do portão, com QR de fallback.

begin;

-- Método de identificação do evento. 'qr' é o padrão — todo evento já
-- existente continua exatamente como está, sem precisar de nada novo.
alter table eventos
  add column if not exists metodo_identificacao text not null default 'qr';

alter table eventos
  drop constraint if exists eventos_metodo_identificacao_check;
alter table eventos
  add constraint eventos_metodo_identificacao_check
  check (metodo_identificacao in ('qr', 'biometria', 'biometria_qr'));

-- ─── Templates faciais ────────────────────────────────────────────────────
--
-- O "vetor" é o embedding de 128 números que descreve o rosto (não é foto,
-- não dá pra "ver" a pessoa olhando pra ele — mas ainda é dado biométrico
-- sensível, e é tratado como tal: só o servidor com service role acessa).
create table if not exists biometria_templates (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios(id) on delete cascade,
  -- Direto aqui, não só via funcionário → fornecedor → evento: é o que torna
  -- o isolamento por evento uma cláusula `where`, não uma dedução.
  evento_id uuid not null references eventos(id) on delete cascade,
  vetor jsonb not null,
  versao_modelo text not null default 'face-api-128d-v1',
  qualidade numeric,
  criado_por_perfil_id uuid references perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Um rosto ativo por pessoa por evento — recadastrar substitui o anterior
  -- (upsert), nunca acumula.
  unique (funcionario_id, evento_id)
);

create index if not exists biometria_templates_por_evento on biometria_templates (evento_id);

-- ─── Consentimento ──────────────────────────────────────────────────────────
--
-- LGPD art. 11: biometria é dado sensível, exige base legal registrada.
-- Fica separado do "aceite da base regional" que já existe no cadastro —
-- são finalidades diferentes. Gravado ANTES da captura, nunca depois.
create table if not exists biometria_consentimentos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios(id) on delete cascade,
  evento_id uuid not null references eventos(id) on delete cascade,
  versao_termo text not null default '1',
  aceito_em timestamptz not null default now(),
  -- Quem operava o aparelho quando a pessoa aceitou (cadastro é hoje sempre
  -- assistido, no portão — ver o comentário de `cadastrarBiometria`).
  registrado_por_perfil_id uuid references perfis(id) on delete set null,
  revogado_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists biometria_consentimentos_por_pessoa on biometria_consentimentos (funcionario_id, evento_id);

-- ─── Log de tentativas ──────────────────────────────────────────────────────
--
-- NUNCA guarda vetor nem foto — só o resultado. É o que responde "quantas
-- pessoas precisaram do QR porque a biometria falhou" sem guardar nenhum
-- dado biométrico bruto no log.
create table if not exists biometria_tentativas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references eventos(id) on delete cascade,
  -- Nulo quando não achou ninguém — não se aponta pra um funcionário errado.
  funcionario_id uuid references funcionarios(id) on delete set null,
  perfil_id uuid references perfis(id) on delete set null,
  -- sucesso | nao_identificado | qualidade_baixa | liveness_falhou | erro
  resultado text not null,
  distancia numeric,
  duracao_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists biometria_tentativas_por_evento on biometria_tentativas (evento_id, created_at desc);

alter table biometria_templates enable row level security;
alter table biometria_consentimentos enable row level security;
alter table biometria_tentativas enable row level security;

commit;
