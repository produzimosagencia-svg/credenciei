/**
 * Leitura da planilha de equipe, no navegador.
 *
 * Roda no cliente de propósito: o arquivo é lido por código, não pela IA. Um
 * modelo transcrevendo 40 CPFs pode trocar um dígito, e CPF é justamente o
 * campo que precisa bater exato — é ele que identifica a pessoa na base e
 * evita duplicata. A IA decide o destino e explica o resultado; quem lê os
 * números é isto aqui.
 */

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
