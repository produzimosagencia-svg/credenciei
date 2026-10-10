-- ════════════════════════════════════════════════════════════════════════════
-- Base de pessoas PERMANENTE — ninguém sai da base
-- ════════════════════════════════════════════════════════════════════════════
-- Aditiva. Pedido do Juan (10/10/2026): "excluir funcionário do evento não quer
-- dizer que pode excluir ele da base… funcionário nenhum pode ser excluído da base".
--
-- Antes, a base (tela Encontrar) era montada das fichas de evento (`funcionarios`):
-- excluir a pessoa do evento, ou apagar o evento, tirava ela da base. Agora há uma
-- tabela própria, UMA LINHA POR CPF, sem ligação com evento, que só cresce:
--   * todo cadastro novo ou corrigido (link, planilha, sistema, IA) entra nela pelo
--     gatilho abaixo — e o gatilho NUNCA impede o cadastro (erro vira só aviso no log);
--   * não há gatilho de exclusão: excluir do evento não toca na base;
--   * a carga inicial traz todas as fichas de hoje E todos os excluídos da lixeira.
--
-- Rode no SQL Editor do Supabase (uma vez). Pode rodar de novo sem problema.

begin;

create table if not exists base_pessoas (
  cpf                 text primary key,
  nome                text not null,
  telefone            text,
  cidade              text,
  cargo               text,
  chave_pix           text,
  consentimento_base  boolean not null default false,
  primeiro_cadastro   timestamptz not null default now(),
  ultimo_cadastro     timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index if not exists base_pessoas_ultimo on base_pessoas (ultimo_cadastro desc);
alter table base_pessoas enable row level security;   -- só o servidor (service role) lê e grava

create or replace function guardar_na_base_pessoas() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cpf text := regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g');
begin
  if length(v_cpf) <> 11 or coalesce(trim(new.nome), '') = '' then
    return new;
  end if;
  begin
    insert into base_pessoas as b
      (cpf, nome, telefone, cidade, cargo, chave_pix, consentimento_base, primeiro_cadastro, ultimo_cadastro, atualizado_em)
    values
      (v_cpf, trim(new.nome),
       nullif(trim(coalesce(new.telefone, '')), ''), nullif(trim(coalesce(new.cidade, '')), ''),
       nullif(trim(coalesce(new.cargo, '')), ''), nullif(trim(coalesce(new.chave_pix, '')), ''),
       coalesce(new.consentimento_base, false), coalesce(new.created_at, now()), coalesce(new.created_at, now()), now())
    on conflict (cpf) do update set
      nome               = excluded.nome,
      telefone           = coalesce(excluded.telefone, b.telefone),
      cidade             = coalesce(excluded.cidade, b.cidade),
      cargo              = coalesce(excluded.cargo, b.cargo),
      chave_pix          = coalesce(excluded.chave_pix, b.chave_pix),
      consentimento_base = b.consentimento_base or excluded.consentimento_base,
      primeiro_cadastro  = least(b.primeiro_cadastro, excluded.primeiro_cadastro),
      ultimo_cadastro    = greatest(b.ultimo_cadastro, excluded.ultimo_cadastro),
      atualizado_em      = now();
  exception when others then
    -- A base nunca pode impedir um cadastro de evento.
    raise warning 'base_pessoas não atualizada para o CPF %: %', v_cpf, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists funcionarios_guardar_na_base on funcionarios;
create trigger funcionarios_guardar_na_base
  after insert or update of nome, cpf, telefone, cidade, cargo, chave_pix, consentimento_base on funcionarios
  for each row execute function guardar_na_base_pessoas();

-- Carga inicial: todas as fichas de hoje + todos os excluídos guardados na lixeira.
insert into base_pessoas (cpf, nome, telefone, cidade, cargo, chave_pix, consentimento_base, primeiro_cadastro, ultimo_cadastro)
select cpf,
       (array_agg(nome order by criado desc))[1],
       (array_agg(telefone order by criado desc) filter (where telefone is not null))[1],
       (array_agg(cidade order by criado desc) filter (where cidade is not null))[1],
       (array_agg(cargo order by criado desc) filter (where cargo is not null))[1],
       (array_agg(chave_pix order by criado desc) filter (where chave_pix is not null))[1],
       bool_or(consentimento), min(criado), max(criado)
from (
  select regexp_replace(coalesce(cpf, ''), '\D', '', 'g') as cpf, trim(nome) as nome,
         nullif(trim(coalesce(telefone, '')), '') as telefone, nullif(trim(coalesce(cidade, '')), '') as cidade,
         nullif(trim(coalesce(cargo, '')), '') as cargo, nullif(trim(coalesce(chave_pix, '')), '') as chave_pix,
         coalesce(consentimento_base, false) as consentimento, created_at as criado
  from funcionarios
  union all
  select regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g'), trim(e.nome),
         nullif(trim(coalesce(e.dados->>'telefone', '')), ''), nullif(trim(coalesce(e.dados->>'cidade', '')), ''),
         nullif(trim(coalesce(e.dados->>'cargo', '')), ''), nullif(trim(coalesce(e.dados->>'chave_pix', '')), ''),
         coalesce((e.dados->>'consentimento_base')::boolean, false),
         coalesce((e.dados->>'created_at')::timestamptz, e.excluido_em)
  from funcionarios_excluidos e
) t
where length(cpf) = 11 and coalesce(nome, '') <> ''
group by cpf
on conflict (cpf) do nothing;

commit;

-- Conferir:   select count(*) from base_pessoas;
-- Reverter (a base volta a ser só as fichas de evento):
--     drop trigger if exists funcionarios_guardar_na_base on funcionarios;
--     drop function if exists guardar_na_base_pessoas();
--     drop table if exists base_pessoas;
