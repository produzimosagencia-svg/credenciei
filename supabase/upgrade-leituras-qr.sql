-- Histórico de TODAS as leituras do scanner — aceitas e recusadas.
--
-- Pedido do Juan (26/09/2026, Pontal Weekend): leitura recusada não deixava
-- rastro nenhum. Quem tentou entrar, deu erro no QR e foi pro registro
-- manual (ou foi embora) era invisível — só dava pra adivinhar pelos
-- lançamentos manuais. Agora cada leitura grava quem foi lido, quem leu, o
-- resultado e a mensagem que apareceu na tela do operador.
--
-- O sistema grava DEPOIS de responder ao operador (não atrasa o portão) e
-- tolera esta tabela ainda não existir: sem ela, só não grava.
--
-- Não guarda o conteúdo do QR (tem o token da credencial dentro).

begin;

create table if not exists leituras_qr (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references eventos(id) on delete cascade,
  -- Quem apontou a câmera.
  perfil_id uuid references perfis(id) on delete set null,
  -- Quem foi lido — nulo quando o QR não é de ninguém (inválido, de fora).
  funcionario_id uuid references funcionarios(id) on delete set null,
  -- 'credencial' ou 'veiculo'.
  tipo text not null default 'credencial',
  sucesso boolean not null,
  -- liberado | saida | ja_validado | negado | invalido | erro
  resultado text not null,
  -- A frase que o operador viu na tela.
  mensagem text,
  created_at timestamptz not null default now()
);

create index if not exists leituras_qr_por_evento on leituras_qr (evento_id, created_at desc);
create index if not exists leituras_qr_por_funcionario on leituras_qr (funcionario_id, created_at desc);

-- Mesmo regime do resto do banco: só o servidor (service role) lê e escreve.
alter table leituras_qr enable row level security;

commit;
