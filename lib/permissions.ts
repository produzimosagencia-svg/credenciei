// Hierarquia de papéis do sistema (SaaS multi-organização):
//   master          → dono da plataforma. Enxerga e gerencia TODAS as
//                      organizações, todos os eventos e cria os admins.
//                      organizacao_id = null.
//   admin           → dono de UMA organização. Enxerga apenas os dados da
//                      própria organização (eventos.organizacao_id =
//                      perfil.organizacao_id). Cria a equipe (supervisores)
//                      e eventos até o limite da org. NÃO pode excluir
//                      eventos (só o master exclui).
//   supervisor      → vinculado a UM setor (fornecedor) específico via
//                      perfis.fornecedor_id. Gerencia a equipe daquele setor
//                      — nunca vê outros setores/eventos/organização.
//   operador_portao → vinculado ao EVENTO inteiro (fornecedor_id nulo), não
//                      a um setor. Só lê QR e registra ponto manual — nunca
//                      gerencia evento, equipe ou usuários. É o papel de
//                      quem opera fisicamente o credenciamento sem precisar
//                      de senha de admin.
//   suporte         → gente CONTRATADA pro dia do evento, pra resolver
//                      problema de operação (CPF errado, setor errado, ponto
//                      que não bateu, supervisor sem senha) sem ser dono da
//                      conta. Vinculado a organizações e/ou eventos
//                      específicos via `suporte_escopo` (nunca a organização
//                      inteira do sistema, como o master) e pode ter
//                      `perfis.acesso_expira_em` — passada a data, o acesso
//                      para de funcionar sozinho. Corrige a operação; nunca
//                      administra: não exclui, não mexe em financeiro, não
//                      cria admin, não dispara WhatsApp em massa. Ver
//                      supabase/upgrade-suporte.sql e lib/suporte.ts.
//
// Papéis legados ('gerente', 'cliente') continuam válidos no banco, mas não
// são mais oferecidos na UI. Tratamos 'gerente' como equivalente a admin.

export type Role = 'master' | 'admin' | 'supervisor' | 'gerente' | 'cliente' | 'operador_portao' | 'suporte'

// ─── Permissões editáveis por organização ────────────────────────────────────

/**
 * O que se pergunta a uma função de permissão: um papel, ou o perfil inteiro.
 *
 * Passar o PERFIL é o que faz a resposta considerar o que a organização
 * ligou ou desligou na tela de Configurações (`permissoes` vem carregado em
 * `getPerfil`). Passar só o papel continua valendo e responde pelo padrão do
 * código — é o que sobra pros componentes de cliente, que recebem `role` como
 * texto e não devem receber o perfil inteiro.
 */
export type AlvoPermissao =
  | string
  | { role?: string | null; permissoes?: Record<string, boolean> | null }
  | null
  | undefined

export const chaveDaPermissao = (role: string, chave: string) => `${role}:${chave}`

/**
 * Resolve uma permissão: exceção da organização primeiro, padrão do código
 * depois.
 *
 * MASTER NUNCA É AFETADO. Uma tela de permissões capaz de tirar do master a
 * permissão de abrir a tela de permissões se tranca sozinha, e a saída seria
 * pelo banco. Também é o que garante que, se a tabela vier corrompida ou
 * mal preenchida, ainda exista alguém que consegue consertar.
 */
function resolver(alvo: AlvoPermissao, chave: string, padrao: (role?: string) => boolean): boolean {
  const role = typeof alvo === 'string' ? alvo : alvo?.role ?? undefined
  if (role === 'master') return padrao(role)
  const excecoes = typeof alvo === 'string' ? null : alvo?.permissoes
  const excecao = role ? excecoes?.[chaveDaPermissao(role, chave)] : undefined
  return typeof excecao === 'boolean' ? excecao : padrao(role)
}

/** Fábrica das funções abaixo: cada uma é "o padrão do código + a exceção". */
function capacidade(chave: string, padrao: (role?: string) => boolean) {
  return (alvo?: AlvoPermissao) => resolver(alvo, chave, padrao)
}

export const ROLE_LABELS: Record<Role, string> = {
  master: 'Master',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  gerente: 'Gerente',
  cliente: 'Cliente',
  operador_portao: 'Operador de portão',
  suporte: 'Suporte de Sistema',
}

/** Dono da plataforma: acesso irrestrito a todas as organizações. */
export const ehMaster = (role?: string) => role === 'master'

/** Enxerga todos os eventos do sistema (não só os da própria organização). */
export const veTodosEventos = capacidade('ver_todos_eventos', role => role === 'master')

/** Pode gerenciar organizações (criar admins, ativar/suspender, definir limites). */
export const podeGerenciarOrganizacoes = capacidade('gerenciar_organizacoes', role => role === 'master')

/** Pode criar/editar/excluir usuários. Master gerencia admins; admin gerencia a própria equipe. */
export const podeGerenciarUsuarios = capacidade('gerenciar_acessos', role =>
  role === 'master' || role === 'admin' || role === 'gerente')

/** Pode criar/editar eventos, fornecedores, setores e funcionários. */
export const podeGerenciarEventos = capacidade('gerenciar_eventos', role =>
  role === 'master' || role === 'admin' || role === 'gerente' || role === 'cliente')

/**
 * Pode EXCLUIR qualquer coisa do sistema — evento, setor, funcionário,
 * supervisor, organização. Só o master.
 *
 * Exclusão aqui é sempre em cascata (apagar um setor leva a equipe e as
 * presenças junto) e não tem desfazer. O admin continua podendo ENCERRAR
 * evento e DESATIVAR pessoa, que resolvem o mesmo problema do dia a dia sem
 * destruir histórico. Quando ele precisa apagar de verdade, fala com a
 * plataforma — é a fricção que se quer.
 */
export const podeExcluir = capacidade('excluir', role => role === 'master')

/** @deprecated Use `podeExcluir`. Mantido porque já é chamado em algumas telas. */
export const podeExcluirEventos = podeExcluir

/**
 * Pode APAGAR alguém da equipe de um setor.
 *
 * Mais largo que `podeExcluir` (só master) de propósito, decisão do Juan em
 * 04/09/2026: o supervisor precisava disso pra limpar a própria equipe sem
 * depender de ninguém — desativar não estava resolvendo o caso dele.
 *
 * O escopo não mora aqui: quem prende o supervisor aos setores DELE é
 * `exigirAcessoFuncionarios`, na action. Esta função só diz quais papéis
 * têm a ação — nunca sobre qual equipe.
 */
export const podeExcluirDaEquipe = capacidade('excluir_da_equipe', role =>
  role === 'master' || role === 'admin' || role === 'supervisor' || role === 'suporte')

/** Dono de um acesso de apoio contratado pro evento — nunca administra. */
export const ehSuporte = (role?: string) => role === 'suporte'

/**
 * Pode corrigir um dado de identidade já cadastrado (hoje: só o CPF do
 * funcionário) — algo que a própria pessoa não tem como refazer sozinha sem
 * perder o QR, o histórico de batidas e o pagamento já vinculados ao
 * cadastro antigo.
 *
 * Master sempre; suporte também, mas só DENTRO do escopo dele — a checagem
 * de escopo (`suporteTemEscopo`, em lib/suporte.ts) mora na action, não
 * aqui, porque esta função não recebe evento/organização pra comparar. É o
 * papel previsto na decisão do Juan em 02/09/2026, construído em 03/09/2026.
 */
export const podeEditarIdentidade = capacidade('corrigir_cpf', role => role === 'master' || role === 'suporte')

/**
 * Pode cadastrar/excluir VEÍCULOS autorizados a entrar no evento.
 *
 * Mais estreito que `podeGerenciarEventos` de propósito (decisão do Juan,
 * 03/09/2026): fica de fora `gerente` e `cliente`, que gerenciam evento mas
 * não respondem pelo portão. Entra `suporte`, que é justamente quem conserta
 * a operação no dia — e, como sempre, só DENTRO do escopo dele (a checagem
 * de escopo mora na action, ver `exigirAcessoAVeiculos`).
 *
 * Autorizar um veículo é dizer quem entra dirigindo no evento; é decisão de
 * quem administra ou de quem apoia a operação, não de quem só acompanha.
 */
export const podeGerenciarVeiculos = capacidade('gerenciar_veiculos', role =>
  role === 'master' || role === 'admin' || role === 'suporte')

/**
 * Pode LER o QR e registrar presença pelo scanner.
 *
 * O supervisor ficou de fora a pedido. Quem credencia é o posto de
 * credenciamento — o supervisor cuida da equipe, não do portão. É a mesma
 * separação que as mensagens já dizem à equipe ("vá ao credenciamento", e não
 * "procure seu supervisor"), agora valendo também no sistema.
 *
 * `operador_portao` existe exatamente para ser o posto de credenciamento:
 * escaneia, mas não gerencia nada — ver `podeGerenciarEventos`, que ele NÃO
 * satisfaz.
 */
export const podeEscanear = capacidade('escanear', role =>
  role === 'master' || role === 'admin' || role === 'gerente' || role === 'cliente' || role === 'operador_portao')

/**
 * Pode ACOMPANHAR a operação: atividades, pendências, histórico e a tela de
 * localizar funcionário.
 *
 * Separado de `podeEscanear` porque são coisas diferentes: uma é registrar
 * presença, a outra é olhar quem já registrou. Tirar o scanner do supervisor
 * não pode cegá-lo em relação à própria equipe — é justamente disso que ele
 * cuida.
 */
/*
 * O padrão reaproveita `podeEscanear`, mas com o PAPEL cru: cada
 * interruptor da tela de Configurações é independente. Liberar "escanear"
 * pra um papel não libera "acompanhar" por tabela, e bloquear um não bloqueia
 * o outro — quem configura marca o que quer, sem efeito colateral invisível.
 */
export const podeAcompanhar = capacidade('acompanhar', role =>
  podeEscanear(role) || role === 'supervisor' || role === 'suporte')

// ─── O catálogo, pra tela de Configurações ───────────────────────────────────

/**
 * As capacidades que a tela de Configurações liga e desliga.
 *
 * `padrao` aponta pra própria função de permissão, então a coluna "como é
 * hoje" da tela nunca fica desatualizada em relação ao que o sistema aplica
 * — foi assim que a tela nasceu, e continua sendo a razão de ela ser
 * confiável. Chave nova aqui exige `capacidade('a-mesma-chave', ...)` lá em
 * cima: sem isso a linha aparece na tela e não muda nada.
 */
export const CAPACIDADES: {
  chave: string
  nome: string
  descricao: string
  padrao: (role?: string) => boolean
  /** Aviso mostrado ao ligar — o que essa permissão deixa a pessoa fazer de fato. */
  peso?: string
}[] = [
  { chave: 'ver_todos_eventos', nome: 'Ver todos os eventos',
    descricao: 'Enxerga eventos de todas as organizações, não só da própria',
    padrao: veTodosEventos,
    peso: 'Dá acesso a dados de OUTRAS organizações.' },
  { chave: 'gerenciar_organizacoes', nome: 'Gerenciar organizações',
    descricao: 'Cria e suspende organizações, define limites de evento',
    padrao: podeGerenciarOrganizacoes,
    peso: 'Mexe na plataforma inteira, não só nesta organização.' },
  { chave: 'gerenciar_eventos', nome: 'Gerenciar eventos',
    descricao: 'Cria e edita evento, setor, equipe, avisos e a batida do meio',
    padrao: podeGerenciarEventos },
  { chave: 'gerenciar_acessos', nome: 'Gerenciar acessos',
    descricao: 'Cria e edita quem entra no sistema (supervisores, operadores)',
    padrao: podeGerenciarUsuarios,
    peso: 'Quem cria acesso pode criar acesso pra si mesmo.' },
  { chave: 'escanear', nome: 'Escanear QR',
    descricao: 'Lê a credencial no portão e registra entrada e saída',
    padrao: podeEscanear },
  { chave: 'acompanhar', nome: 'Acompanhar a operação',
    descricao: 'Atividades, pendências, histórico e registro de ponto assistido',
    padrao: podeAcompanhar },
  { chave: 'gerenciar_veiculos', nome: 'Cadastrar veículos',
    descricao: 'Autoriza a entrada de caminhão, van ou carro no evento',
    padrao: podeGerenciarVeiculos },
  { chave: 'corrigir_cpf', nome: 'Corrigir CPF e identidade',
    descricao: 'Conserta cadastro errado sem a pessoa refazer tudo',
    padrao: podeEditarIdentidade,
    peso: 'Mexe em identidade de gente já credenciada.' },
  { chave: 'excluir_da_equipe', nome: 'Excluir da equipe',
    descricao: 'Apaga uma pessoa do setor — e as batidas de ponto dela junto',
    padrao: podeExcluirDaEquipe,
    peso: 'Apaga histórico de presença, sem desfazer.' },
  { chave: 'excluir', nome: 'Excluir do sistema',
    descricao: 'Apaga em cascata — evento, setor, organização',
    padrao: podeExcluir,
    peso: 'Apaga em cascata e não tem desfazer.' },
]

/**
 * Os papéis que a tela mostra em coluna. `master` fica de fora de propósito
 * (ver `resolver`), e os legados 'gerente'/'cliente' também: ninguém cria
 * mais nenhum dos dois, e mostrá-los faria a tela parecer mais complicada do
 * que a operação de fato é.
 */
export const PAPEIS_CONFIGURAVEIS: Role[] = ['admin', 'supervisor', 'operador_portao', 'suporte']
