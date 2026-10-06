/**
 * Importação de ESTRUTURA por planilha — as REGRAS, sem banco.
 *
 * A planilha monta o evento inteiro de uma vez: cada linha é um fornecedor
 * dentro de uma área (subevento — o "Subgrupo" da credencial), com a trava
 * de pessoas por dia e o supervisor responsável:
 *
 *   Fornecedor | Subgrupo | Trava do setor por dia     | Nome | CPF | Telefone
 *   Bar        | Camarote | Sábado: 15 / Domingo: 12   | ...
 *
 * Aqui só se decide o que a linha vira e o que está errado nela — quem grava
 * é lib/actions.ts (`importarEstruturaLote`), linha por linha, pela mesma
 * `criarFornecedorOuLanca` da tela. Sem imports em tempo de execução, pelo
 * mesmo motivo de lib/escala-regras.ts: testável sozinho (testes/estrutura.mjs)
 * e usável na tela.
 *
 * Identidade de cada coisa (é o que torna a reimportação segura):
 *   área        → nome, sem diferenciar maiúscula/acento/espaço
 *   fornecedor  → (área, nome) do mesmo jeito
 *   supervisor  → CPF
 */

export type LinhaEstrutura = {
  /** Número da linha na planilha (cabeçalho = 1), para o erro apontar onde. */
  linha: number
  fornecedor: string
  subgrupo: string
  trava: string
  supervisorNome: string
  supervisorCpf: string
  supervisorTelefone: string
}

/** "Bar  Principal" ≡ "bar principal" ≡ "BÁR PRINCIPAL". */
export function normalizarNome(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Nome como vai ser gravado: espaços arrumados, o resto como a pessoa escreveu. */
export function limparNome(s: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

/** CPF só com dígitos e com os zeros da esquerda que o Excel come quando a célula é número. */
export function normalizarCpfPlanilha(s: string | number): string {
  const d = String(s ?? '').replace(/\D/g, '')
  return d.length > 0 && d.length < 11 ? d.padStart(11, '0') : d
}

// ─── Trava por dia ──────────────────────────────────────────────────────────

const DIAS_SEMANA: [RegExp, number][] = [
  [/^dom(ingo)?$/, 0],
  [/^seg(unda)?(-feira)?$|^2a?$/, 1],
  [/^ter(ca|ça)?(-feira)?$|^3a?$/, 2],
  [/^qua(rta)?(-feira)?$|^4a?$/, 3],
  [/^qui(nta)?(-feira)?$|^5a?$/, 4],
  [/^sex(ta)?(-feira)?$|^6a?$/, 5],
  [/^sab(ado)?$/, 6],
]

function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay()
}

export type ResultadoTrava =
  | { ok: true; porDia: Record<string, number> }
  | { ok: false; erro: string }

/**
 * "Sábado: 10 / Domingo: 8" → { '2026-10-10': 10, '2026-10-11': 8 }.
 *
 * Aceita o jeito que as pessoas escrevem: separado por / ; , | ou quebra de
 * linha; dia por nome (sábado, sáb, sab), por data (10/10) ou só um número
 * ("10" = todos os dias do evento). Vazio = sem trava. Dia da semana que o
 * evento não tem é ERRO, não silêncio: "Domingo: 8" num evento só de sábado
 * quase sempre é planilha do evento errado.
 */
export function interpretarTrava(texto: string, diasDoEvento: string[]): ResultadoTrava {
  const bruto = (texto ?? '').toString().trim()
  if (!bruto) return { ok: true, porDia: {} }

  // Só um número: vale para todos os dias do evento.
  if (/^\d+$/.test(bruto)) {
    const n = Number(bruto)
    if (n <= 0) return { ok: false, erro: 'A trava precisa ser maior que zero.' }
    return { ok: true, porDia: Object.fromEntries(diasDoEvento.map(d => [d, n])) }
  }

  const porDia: Record<string, number> = {}
  // A barra separa dias ("Sábado: 10 / Domingo: 8") mas também está dentro de
  // datas ("10/10: 15"): as datas viram "10.10" ANTES de separar.
  const semDatas = bruto.replace(/(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?(?=\s*[:=\-–]?\s*\d)/g, '$1.$2')
  const juntas = semDatas.split(/[\/;,|\n]+/).map(p => p.trim()).filter(Boolean)

  for (const parte of juntas) {
    const m = parte.match(/^(.+?)\s*[:=\-–]?\s*(\d+)\s*(pessoas?|func(ionarios?)?)?$/i)
    if (!m) return { ok: false, erro: `Não entendi "${parte}". Use, por exemplo, "Sábado: 10 / Domingo: 8".` }
    const rotulo = normalizarNome(m[1]).replace(/[.:]+$/, '').replace(/-feira$/, '')
    const n = Number(m[2])
    if (n <= 0) return { ok: false, erro: `A trava de "${limparNome(m[1])}" precisa ser maior que zero.` }

    const data = rotulo.match(/^(\d{1,2})\.(\d{1,2})$/)
    let alvo: string[]
    if (data) {
      const dd = data[1].padStart(2, '0')
      const mm = data[2].padStart(2, '0')
      alvo = diasDoEvento.filter(d => d.slice(5) === `${mm}-${dd}`)
      if (!alvo.length) return { ok: false, erro: `${dd}/${mm} não é um dia deste evento.` }
    } else {
      const semana = DIAS_SEMANA.find(([re]) => re.test(rotulo))?.[1]
      if (semana === undefined) return { ok: false, erro: `Não entendi o dia "${limparNome(m[1])}".` }
      alvo = diasDoEvento.filter(d => diaDaSemana(d) === semana)
      if (!alvo.length) return { ok: false, erro: `${limparNome(m[1])} não é um dia deste evento.` }
    }
    for (const d of alvo) {
      if (porDia[d] !== undefined && porDia[d] !== n) {
        return { ok: false, erro: `O mesmo dia aparece com duas travas diferentes (${porDia[d]} e ${n}).` }
      }
      porDia[d] = n
    }
  }
  return { ok: true, porDia }
}

// ─── Plano da importação (a prévia) ─────────────────────────────────────────

export type ContextoEstrutura = {
  /** Dias de trabalho do evento ("YYYY-MM-DD"), para ler a trava. */
  dias: string[]
  subeventos: { id: string; nome: string }[]
  fornecedores: { id: string; nome: string; subevento_id: string | null }[]
  /** Quem já tem acesso no sistema, pelo CPF (só os CPFs da planilha). */
  acessos: Map<string, { nome: string; role: string }>
  validarCpf: (cpf: string) => boolean
}

export type LinhaPlanejada = {
  linha: number
  fornecedor: string
  subgrupo: string
  /** 'criar' / 'atualizar' (já existe naquela área) / 'erro' (não entra). */
  acao: 'criar' | 'atualizar' | 'erro'
  subgrupoNovo: boolean
  travaPorDia: Record<string, number>
  supervisor: { nome: string; cpf: string; telefone: string; existente: boolean }
  erros: string[]
  avisos: string[]
}

export type PlanoEstrutura = {
  linhas: LinhaPlanejada[]
  contagens: {
    fornecedoresCriar: number
    fornecedoresAtualizar: number
    subgruposCriar: number
    supervisoresNovos: number
    supervisoresExistentes: number
    supervisoresMultiplos: number
    linhasComErro: number
  }
  /** Nome do supervisor → setores dele, só de quem cuida de mais de um. */
  multiplos: { nome: string; cpf: string; setores: string[] }[]
}

export function planejarEstrutura(linhas: LinhaEstrutura[], ctx: ContextoEstrutura): PlanoEstrutura {
  const subPorNome = new Map(ctx.subeventos.map(s => [normalizarNome(s.nome), s.id]))
  const fornecedorExiste = new Set(ctx.fornecedores.map(f => `${f.subevento_id ?? ''}|${normalizarNome(f.nome)}`))

  // Primeira passada: quantas vezes cada (área, fornecedor) e cada CPF aparecem.
  const chaveSetor = (l: LinhaEstrutura) => `${normalizarNome(l.subgrupo)}|${normalizarNome(l.fornecedor)}`
  const vezesSetor = new Map<string, number>()
  const nomesPorCpf = new Map<string, Set<string>>()
  for (const l of linhas) {
    vezesSetor.set(chaveSetor(l), (vezesSetor.get(chaveSetor(l)) ?? 0) + 1)
    const cpf = normalizarCpfPlanilha(l.supervisorCpf)
    if (cpf) {
      if (!nomesPorCpf.has(cpf)) nomesPorCpf.set(cpf, new Set())
      nomesPorCpf.get(cpf)!.add(normalizarNome(l.supervisorNome))
    }
  }

  const subgruposNovos = new Set<string>()
  const vistosSetor = new Set<string>()
  const planejadas: LinhaPlanejada[] = linhas.map(l => {
    const erros: string[] = []
    const avisos: string[] = []
    const fornecedor = limparNome(l.fornecedor)
    const subgrupo = limparNome(l.subgrupo)
    const cpf = normalizarCpfPlanilha(l.supervisorCpf)
    const telefone = (l.supervisorTelefone ?? '').toString().replace(/\D/g, '')
    const supNome = limparNome(l.supervisorNome)

    if (!fornecedor) erros.push('Falta o nome do fornecedor.')
    if (!subgrupo) erros.push('Falta o subgrupo (área).')
    if (!supNome) erros.push('Falta o nome do supervisor.')
    if (!cpf) erros.push('Falta o CPF do supervisor.')
    else if (cpf.length !== 11 || !ctx.validarCpf(cpf)) erros.push('CPF do supervisor inválido.')
    if (!telefone) erros.push('Falta o telefone do supervisor.')
    else if (telefone.length < 10 || telefone.length > 13) erros.push('Telefone do supervisor inválido (precisa do DDD).')

    if (cpf && (nomesPorCpf.get(cpf)?.size ?? 0) > 1) {
      erros.push('CPF duplicado: o mesmo CPF aparece com nomes de supervisor diferentes.')
    }

    const k = chaveSetor(l)
    if ((vezesSetor.get(k) ?? 0) > 1) {
      if (vistosSetor.has(k)) erros.push('Setor duplicado: este fornecedor já aparece antes nesta mesma área.')
      vistosSetor.add(k)
    }

    const trava = interpretarTrava(l.trava, ctx.dias)
    if (!trava.ok) erros.push(`Trava inválida: ${trava.erro}`)

    const acesso = cpf ? ctx.acessos.get(cpf) : undefined
    if (acesso && acesso.role !== 'supervisor') {
      avisos.push(`Este CPF já tem acesso como ${acesso.role} — ele ganha o fornecedor sem perder o acesso que já tem.`)
    }

    const subId = subPorNome.get(normalizarNome(subgrupo))
    const subgrupoNovo = !!subgrupo && !subId
    if (subgrupoNovo && !erros.length) subgruposNovos.add(normalizarNome(subgrupo))
    const existe = !!subId && fornecedorExiste.has(`${subId}|${normalizarNome(fornecedor)}`)

    return {
      linha: l.linha, fornecedor, subgrupo,
      acao: erros.length ? 'erro' : existe ? 'atualizar' : 'criar',
      subgrupoNovo,
      travaPorDia: trava.ok ? trava.porDia : {},
      supervisor: { nome: supNome, cpf, telefone, existente: !!acesso },
      erros, avisos,
    }
  })

  // Supervisores: contados por CPF, só entre as linhas que vão entrar.
  const validas = planejadas.filter(l => l.acao !== 'erro')
  const setoresPorCpf = new Map<string, { nome: string; existente: boolean; setores: string[] }>()
  for (const l of validas) {
    const atual = setoresPorCpf.get(l.supervisor.cpf) ?? { nome: l.supervisor.nome, existente: l.supervisor.existente, setores: [] }
    atual.setores.push(`${l.fornecedor} (${l.subgrupo})`)
    setoresPorCpf.set(l.supervisor.cpf, atual)
  }
  const multiplos = [...setoresPorCpf].filter(([, s]) => s.setores.length > 1)
    .map(([cpf, s]) => ({ nome: s.nome, cpf, setores: s.setores }))

  return {
    linhas: planejadas,
    contagens: {
      fornecedoresCriar: validas.filter(l => l.acao === 'criar').length,
      fornecedoresAtualizar: validas.filter(l => l.acao === 'atualizar').length,
      subgruposCriar: subgruposNovos.size,
      supervisoresNovos: [...setoresPorCpf.values()].filter(s => !s.existente).length,
      supervisoresExistentes: [...setoresPorCpf.values()].filter(s => s.existente).length,
      supervisoresMultiplos: multiplos.length,
      linhasComErro: planejadas.length - validas.length,
    },
    multiplos,
  }
}

/** Maior trava do dia — vira `quantidade_estimada` (o teto total de sempre). */
export function maiorTrava(porDia: Record<string, number>): number | null {
  const v = Object.values(porDia)
  return v.length ? Math.max(...v) : null
}

/** O que aconteceu com cada linha na gravação (`importarEstruturaLote`). */
export type ResultadoLinhaEstrutura = {
  linha: number
  acao: 'criado' | 'atualizado' | 'erro'
  erro?: string
  aviso?: string
}
