-- Biometria global por CPF — reaproveitar o rosto entre eventos.
--
-- Pedido do Juan (29/09/2026): cadastrar o rosto UMA VEZ por pessoa, não uma
-- vez por evento. `biometria_templates` continua existindo exatamente como
-- está (uma linha por funcionario_id+evento_id) — é o que o reconhecimento
-- no portão (`validarLeituraFacial`) lê, e o isolamento por evento
-- (rosto do evento A nunca comparado no B) continua intacto ali.
--
-- Esta tabela é o "banco mestre": guarda o vetor mais recente de cada CPF,
-- sem depender de nenhum funcionario_id/evento_id específico. No cadastro
-- de um evento novo, se o CPF já tem um perfil aqui, o vetor é COPIADO pra
-- uma linha nova em `biometria_templates` (ver `cadastrarFuncionarioPublico`
-- em lib/actions.ts) — a pessoa não passa pela câmera de novo, e o
-- reconhecimento do evento novo funciona exatamente igual a uma captura
-- fresca, porque tecnicamente é uma.

begin;

create table if not exists biometria_perfis (
  id uuid primary key default gen_random_uuid(),
  cpf text not null unique,
  vetor jsonb not null,
  versao_modelo text not null default 'face-api-128d-v1',
  qualidade numeric,
  -- De onde veio a captura mais recente — só auditoria (saber quando e onde
  -- o rosto foi atualizado pela última vez), nunca lido pra decidir nada.
  origem_funcionario_id uuid references funcionarios(id) on delete set null,
  origem_evento_id uuid references eventos(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table biometria_perfis enable row level security;

commit;
