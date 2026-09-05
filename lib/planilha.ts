/**
 * Leitura e exportação da planilha de equipe, no navegador.
 *
 * Roda no cliente de propósito: o arquivo é lido por código, não pela IA. Um
 * modelo transcrevendo 40 CPFs pode trocar um dígito, e CPF é justamente o
 * campo que precisa bater exato — é ele que identifica a pessoa na base e
 * evita duplicata. A IA decide o destino e explica o resultado; quem lê os
 * números é isto aqui.
 */

import { formatCpf, formatTelefone } from './format'

export type LinhaPlanilha = {
  nome: string
  cpf: string
  telefone: string
  chavePix: string
  cargo: string
  cidade: string
  valor: string
}

/**
 * Nomes de coluna aceitos, em ordem de preferência. Fonte única: a tela do
 * evento e o chat da IA leem a mesma planilha do mesmo jeito.
 */
const COLUNAS: Record<keyof LinhaPlanilha, string[]> = {
  nome: ['nome', 'name', 'nome completo'],
  cpf: ['cpf'],
  telefone: ['telefone', 'phone', 'celular', 'tel'],
  chavePix: ['chave pix', 'chave_pix', 'pix'],
  cargo: ['cargo', 'função', 'funcao', 'role'],
  // Mesmo campo que o formulário público pede: cidade onde a pessoa MORA.
  // É o que alimenta a busca por região em "Encontrar funcionários".
  cidade: ['cidade', 'cidade onde mora', 'municipio', 'município', 'city'],
  valor: ['valor', 'valor a receber', 'valor_receber'],
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function valorDaColuna(linha: Record<string, any>, apelidos: string[]): string {
  for (const apelido of apelidos) {
    const achada = Object.keys(linha).find(k => k.toLowerCase().trim() === apelido.toLowerCase())
    if (achada) return String(linha[achada]).trim()
  }
  return ''
}

/**
 * Lê o arquivo e devolve as linhas com nome preenchido. Linha sem nome é
 * descartada aqui — costuma ser rodapé ou linha em branco do fim da planilha.
 *
 * `xlsx` é pesado e só serve a este caminho, então entra por import dinâmico.
 */
export async function lerPlanilhaDeEquipe(arquivo: File): Promise<LinhaPlanilha[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linhas = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' })

  return linhas
    .map(linha => ({
      nome: valorDaColuna(linha, COLUNAS.nome),
      cpf: valorDaColuna(linha, COLUNAS.cpf),
      telefone: valorDaColuna(linha, COLUNAS.telefone),
      chavePix: valorDaColuna(linha, COLUNAS.chavePix),
      cargo: valorDaColuna(linha, COLUNAS.cargo),
      cidade: valorDaColuna(linha, COLUNAS.cidade),
      valor: valorDaColuna(linha, COLUNAS.valor),
    }))
    .filter(l => l.nome)
}

/**
 * Resumo do que veio na planilha, pra IA saber do que está falando sem
 * receber os dados das pessoas. Só contagens e os cargos citados.
 */
export function resumirPlanilha(linhas: LinhaPlanilha[]) {
  const unicos = (vals: string[]) => [...new Set(vals.filter(Boolean))].slice(0, 12)
  return {
    linhas: linhas.length,
    sem_telefone: linhas.filter(l => !l.telefone).length,
    sem_cargo: linhas.filter(l => !l.cargo).length,
    sem_cidade: linhas.filter(l => !l.cidade).length,
    cargos_citados: unicos(linhas.map(l => l.cargo)),
    cidades_citadas: unicos(linhas.map(l => l.cidade)),
  }
}

export type LinhaExportacao = {
  nome: string
  cpf: string
  telefone: string
  cargo: string
  chave_pix: string
  valor_receber: number | null
  pago: boolean
  pago_em: string | null
  ativo: boolean
  /** Quando a pessoa se credenciou neste evento. */
  created_at?: string | null
  /** Só vêm quando a exportação pediu fluxo de presença (ver `colunas`). */
  entrada?: string | null
  meio?: string | null
  fim?: string | null
}

const ROTULO_ETAPA: Record<'entrada' | 'meio' | 'fim', string> = {
  entrada: 'Entrada', meio: 'Meio', fim: 'Saída',
}

/** "2026-09-05T08:43:00Z" → "08:43". O dia já está no nome do arquivo e da aba. */
function soHora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

/**
 * Gera e baixa o .xlsx da equipe de um setor, direto no navegador.
 *
 * Mesma lógica de `lerPlanilhaDeEquipe`, ao contrário: aqui não se lê nada do
 * usuário, então não existe risco de digitação — o CPF já está exato, vindo
 * do banco. O que importa é a formatação, para quem abre no Excel entender de
 * cara o que está vendo (CPF com pontuação, "Sim/Não" em vez de true/false).
 *
 * `opcoes.colunas` liga o fluxo de presença (hora de cada etapa marcada,
 * NUM dia só — ver o comentário de `exportarFuncionariosDoSetor`). Sem ela, a
 * planilha é só o cadastro, como já era.
 */
export async function exportarPlanilhaDeEquipe(
  eventoNome: string,
  setorNome: string,
  funcionarios: LinhaExportacao[],
  opcoes?: { diaLabel: string; colunas: ('entrada' | 'meio' | 'fim')[] },
): Promise<void> {
  const XLSX = await import('xlsx')

  const colunas = opcoes?.colunas ?? []
  const linhas = funcionarios.map(f => ({
    Nome: f.nome,
    CPF: f.cpf ? formatCpf(f.cpf) : '',
    Telefone: f.telefone ? formatTelefone(f.telefone) : '',
    Cargo: f.cargo || '',
    'Chave PIX': f.chave_pix || '',
    'Valor a receber': f.valor_receber ?? '',
    Pago: f.pago ? 'Sim' : 'Não',
    'Data do pagamento': f.pago_em ? new Date(f.pago_em).toLocaleDateString('pt-BR') : '',
    Ativo: f.ativo ? 'Sim' : 'Não',
    // Data do credenciamento: é por ela que se separa quem entrou na lista
    // original de quem entrou depois, na véspera ou no portão.
    'Credenciado em': f.created_at ? new Date(f.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
    ...Object.fromEntries(colunas.map(c => [ROTULO_ETAPA[c], soHora(f[c])])),
  }))

  const ws = XLSX.utils.json_to_sheet(linhas)
  ws['!cols'] = [
    { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 8 }, { wch: 20 },
    ...colunas.map(() => ({ wch: 10 })),
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, setorNome.slice(0, 31) || 'Equipe')

  // Nome do arquivo sem caracteres que o Windows/macOS recusam.
  const sufixoDia = opcoes?.diaLabel ? ` - ${opcoes.diaLabel}` : ''
  const nomeArquivo = `${eventoNome} - ${setorNome}${sufixoDia}`.replace(/[\\/:*?"<>|]/g, '').slice(0, 120)
  XLSX.writeFile(wb, `${nomeArquivo}.xlsx`)
}
