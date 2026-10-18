/*
 * MONTE SUA EQUIPE — as regras, sem banco (testadas em testes/monte-sua-equipe.mjs).
 *
 * Pedido do Juan (18/10/2026): o supervisor encontra quem já trabalhou com ele e adiciona à equipe nova sem
 * recadastro. Nos dados, 30% da equipe mais recente de cada supervisor já tinha trabalhado com ele e foi cadastrada
 * do zero (a Kissila: 67 de 207 no LUAN, vindas do Henrique e Juliano).
 *
 * "Trabalhou com ele" = teve ficha numa equipe em que ele era supervisor (`supervisor_setores`), em outro evento.
 * A pessoa é o CPF; cada evento tem a sua ficha. Adicionar do histórico cria uma ficha NOVA no evento novo — nunca
 * reaproveita a aprovação do evento anterior.
 *
 * PRIVACIDADE: o aceite do cadastro mostra "nome, cidade, função e telefone para organizadores de outros eventos".
 * Quem só trabalhou com o supervisor em OUTRA organização aparece só com o aceite, e sem foto. Telefone e CPF nunca
 * saem para a tela — o sistema manda a credencial.
 */

export type FichaDoHistorico = {
  id: string
  cpf: string
  nome: string
  cargo: string | null
  cidade: string | null
  telefone: string | null
  chavePix: string | null
  fotoPath: string | null
  fornecedorId: string
  criadoEm: string
  consentimento: boolean
}

export type EquipeDoHistorico = {
  id: string
  nome: string
  eventoId: string
  eventoNome: string
  eventoData: string | null
  organizacaoId: string | null
}

/** Uma ficha do mesmo CPF no evento novo (qualquer equipe, com ou sem baixa). */
export type FichaNoEventoNovo = { cpf: string; fornecedor_id: string; descredenciado_em: string | null; equipe: string }

export type SituacaoNoHistorico =
  | 'disponivel'
  | 'sem_telefone'
  | 'na_equipe'
  | 'baixa_na_equipe'
  | 'em_outra_equipe'
  | 'bloqueado'

export type Participacao = { evento: string; equipe: string; quando: string | null; cargo: string | null; dias: number }

export type PessoaDoHistorico = {
  /** A ficha mais recente — é por ela que a tela escolhe a pessoa (o CPF não sai do servidor). */
  chave: string
  nome: string
  cargo: string | null
  cidade: string | null
  participacoes: Participacao[]
  diasTrabalhados: number
  situacao: SituacaoNoHistorico
  /** O nome da outra equipe, quando `em_outra_equipe`. */
  detalhe: string | null
  outraOrganizacao: boolean
}

/** O que só o servidor usa (nunca vai para a tela). */
export type PessoaDoHistoricoNoServidor = PessoaDoHistorico & {
  cpf: string
  telefone: string | null
  chavePix: string | null
  /** Foto só de quem é da mesma organização. */
  fotoPath: string | null
}

/**
 * Telefone que recebe a credencial: 10 a 13 dígitos e não o genérico de destravar cadastro (DDD + zeros, como o
 * "27 0000-0000" usado no LUAN para quem não tinha telefone).
 */
export function telefoneValido(t: string | null | undefined): boolean {
  const d = String(t ?? '').replace(/\D/g, '')
  if (d.length < 10 || d.length > 13) return false
  return !/^(55)?\d{2}0{8,9}$/.test(d)
}

export const ROTULO_SITUACAO: Record<SituacaoNoHistorico, string> = {
  disponivel: 'pronta para entrar',
  sem_telefone: 'sem telefone',
  na_equipe: 'já está na equipe',
  baixa_na_equipe: 'com baixa nesta equipe',
  em_outra_equipe: 'em outra equipe do evento',
  bloqueado: 'CPF bloqueado',
}

/** O que fazer, para quem não pode entrar direto — a tela mostra isto ao lado do motivo. */
export const O_QUE_FAZER: Record<Exclude<SituacaoNoHistorico, 'disponivel'>, string> = {
  sem_telefone: 'Cadastre pela equipe com o telefone (Cadastrar ou planilha).',
  na_equipe: 'Nada a fazer: ela já está na equipe.',
  baixa_na_equipe: 'Use "Trazer de volta" na linha dela, na lista da equipe.',
  em_outra_equipe: 'Peça ao admin para mover a pessoa de equipe.',
  bloqueado: 'Fale com o admin do evento: o CPF está bloqueado.',
}

const ORDEM_SITUACAO: Record<SituacaoNoHistorico, number> = {
  disponivel: 0, sem_telefone: 1, bloqueado: 2, em_outra_equipe: 3, baixa_na_equipe: 4, na_equipe: 5,
}

const cpfLimpo = (c: string) => String(c ?? '').replace(/\D/g, '')

/**
 * Junta as fichas por CPF e decide, para cada pessoa, o que aparece e se ela pode entrar na equipe nova.
 *
 * `fornecedorAlvo` é a equipe nova; `organizacaoAlvo`, a organização do evento novo; `noEventoNovo`, as fichas
 * dos mesmos CPFs no evento novo; `bloqueados`, os CPFs bloqueados para esta equipe.
 */
export function montarHistorico(args: {
  fichas: FichaDoHistorico[]
  equipes: Map<string, EquipeDoHistorico>
  diasPorFicha: Map<string, number>
  consentimentoNaBase: Map<string, boolean>
  noEventoNovo: FichaNoEventoNovo[]
  bloqueados: Set<string>
  fornecedorAlvo: string
  organizacaoAlvo: string | null
}): { pessoas: PessoaDoHistoricoNoServidor[]; ocultasSemAceite: number } {
  const porCpf = new Map<string, FichaDoHistorico[]>()
  for (const f of args.fichas) {
    const cpf = cpfLimpo(f.cpf)
    if (cpf.length !== 11 || !args.equipes.has(f.fornecedorId)) continue
    porCpf.set(cpf, [...(porCpf.get(cpf) ?? []), f])
  }
  const fichasNoNovo = new Map<string, FichaNoEventoNovo[]>()
  for (const f of args.noEventoNovo) {
    const cpf = cpfLimpo(f.cpf)
    fichasNoNovo.set(cpf, [...(fichasNoNovo.get(cpf) ?? []), f])
  }

  const pessoas: PessoaDoHistoricoNoServidor[] = []
  let ocultasSemAceite = 0
  for (const [cpf, fichas] of porCpf) {
    const recentes = [...fichas].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    const maisRecente = recentes[0]
    const equipesDaPessoa = recentes.map(f => args.equipes.get(f.fornecedorId)!)
    const mesmaOrganizacao = !!args.organizacaoAlvo && equipesDaPessoa.some(e => e.organizacaoId === args.organizacaoAlvo)
    const aceite = args.consentimentoNaBase.get(cpf) === true || fichas.some(f => f.consentimento)
    if (!mesmaOrganizacao && !aceite) { ocultasSemAceite++; continue }

    const participacoes: Participacao[] = recentes.map(f => {
      const e = args.equipes.get(f.fornecedorId)!
      return { evento: e.eventoNome, equipe: e.nome, quando: e.eventoData, cargo: f.cargo, dias: args.diasPorFicha.get(f.id) ?? 0 }
    }).sort((a, b) => String(b.quando ?? '').localeCompare(String(a.quando ?? '')))

    const telefone = recentes.map(f => f.telefone).find(telefoneValido) ?? null
    const noNovo = fichasNoNovo.get(cpf) ?? []
    const naEquipe = noNovo.find(f => f.fornecedor_id === args.fornecedorAlvo && !f.descredenciado_em)
    const emOutra = noNovo.find(f => f.fornecedor_id !== args.fornecedorAlvo && !f.descredenciado_em)
    const baixaAqui = noNovo.find(f => f.fornecedor_id === args.fornecedorAlvo && f.descredenciado_em)
    // A mesma régua de `fichaQueImpedeCadastro`: baixa em OUTRA equipe não impede.
    const situacao: SituacaoNoHistorico = naEquipe ? 'na_equipe'
      : emOutra ? 'em_outra_equipe'
      : baixaAqui ? 'baixa_na_equipe'
      : args.bloqueados.has(cpf) ? 'bloqueado'
      : !telefone ? 'sem_telefone'
      : 'disponivel'

    pessoas.push({
      chave: maisRecente.id,
      cpf,
      nome: maisRecente.nome,
      cargo: recentes.map(f => f.cargo).find(c => !!c?.trim()) ?? null,
      cidade: recentes.map(f => f.cidade).find(c => !!c?.trim()) ?? null,
      participacoes,
      diasTrabalhados: participacoes.reduce((s, p) => s + p.dias, 0),
      situacao,
      detalhe: situacao === 'em_outra_equipe' ? emOutra!.equipe : null,
      outraOrganizacao: !mesmaOrganizacao,
      telefone,
      chavePix: recentes.map(f => f.chavePix).find(c => !!c?.trim()) ?? null,
      fotoPath: mesmaOrganizacao ? (recentes.map(f => f.fotoPath).find(p => !!p) ?? null) : null,
    })
  }

  // Quem pode entrar primeiro; entre esses, quem mais trabalhou com o supervisor; depois o nome.
  pessoas.sort((a, b) =>
    ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao]
    || b.diasTrabalhados - a.diasTrabalhados
    || a.nome.localeCompare(b.nome, 'pt-BR'))
  return { pessoas, ocultasSemAceite }
}

/** O que vai para a tela: sem CPF, telefone, PIX nem o caminho da foto. */
export function paraATela(p: PessoaDoHistoricoNoServidor): PessoaDoHistorico {
  const { cpf: _cpf, telefone: _tel, chavePix: _pix, fotoPath: _foto, ...resto } = p
  void _cpf; void _tel; void _pix; void _foto
  return resto
}
