-- Eventos
create table eventos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  data_inicio timestamptz not null,
  data_fim timestamptz not null,
  local text,
  ativo boolean default true,
  created_at timestamptz default now()
);

-- Fornecedores (empresas prestadoras de serviço)
create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references eventos(id) on delete cascade,
  nome text not null,
  email_contato text,
  token_formulario text unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz default now()
);

-- Funcionários (preenchidos via formulário)
create table funcionarios (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid references fornecedores(id) on delete cascade,
  nome text not null,
  cpf text not null,
  telefone text not null,
  email text not null,
  empresa text not null,
  cargo text not null,
  qr_token text unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz default now()
);

-- Registros de entrada/saída
create table registros (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid references funcionarios(id) on delete cascade,
  evento_id uuid references eventos(id) on delete cascade,
  tipo text check (tipo in ('entrada', 'saida')) not null,
  created_at timestamptz default now()
);

-- Índices
create index on fornecedores(evento_id);
create index on funcionarios(fornecedor_id);
create index on funcionarios(qr_token);
create index on registros(funcionario_id, evento_id);

-- RLS desabilitado para uso local/desenvolvimento
alter table eventos disable row level security;
alter table fornecedores disable row level security;
alter table funcionarios disable row level security;
alter table registros disable row level security;
