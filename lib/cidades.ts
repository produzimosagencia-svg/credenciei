// Cidades da operação — as do Espírito Santo.
//
// Desde 25/09/2026 o cadastro aceita texto livre (evento fora do ES, gente de
// fora do estado): a lista abaixo virou SUGESTÃO no campo, e `grafiaDaCidade`
// acerta a grafia das cidades do ES no servidor. O histórico abaixo explica
// por que a lista existe.
//
// ─── POR QUE UMA LISTA, E NÃO TEXTO LIVRE ───────────────────────────────────
//
// O campo era livre, cada pessoa digitava do seu jeito, e 56 cadastros viraram
// 10 "cidades" para 7 reais: "Vitória" e "Vitoria", "Vila Velha", "Vila Velhas"
// e "Vila Velha, Es".
//
// O estrago não é o contador feio. É a busca: procurar "Vila Velha" achava 14
// pessoas e deixava 2 de fora. Numa base regional que existe justamente para
// achar gente por região, perder gente disponível é o oposto da função dela.
//
// A lista resolve na origem. `normalizarCidade` resolve o que já entrou.

/** Municípios do ES, em ordem alfabética. */
export const CIDADES_ES = [
  'Afonso Cláudio', 'Água Doce do Norte', 'Águia Branca', 'Alegre', 'Alfredo Chaves',
  'Alto Rio Novo', 'Anchieta', 'Apiacá', 'Aracruz', 'Atílio Vivácqua',
  'Baixo Guandu', 'Barra de São Francisco', 'Boa Esperança', 'Bom Jesus do Norte',
  'Brejetuba', 'Cachoeiro de Itapemirim', 'Cariacica', 'Castelo', 'Colatina',
  'Conceição da Barra', 'Conceição do Castelo', 'Divino de São Lourenço',
  'Domingos Martins', 'Dores do Rio Preto', 'Ecoporanga', 'Fundão', 'Governador Lindenberg',
  'Guaçuí', 'Guarapari', 'Ibatiba', 'Ibiraçu', 'Ibitirama', 'Iconha', 'Irupi',
  'Itaguaçu', 'Itapemirim', 'Itarana', 'Iúna', 'Jaguaré', 'Jerônimo Monteiro',
  'João Neiva', 'Laranja da Terra', 'Linhares', 'Mantenópolis', 'Marataízes',
  'Marechal Floriano', 'Marilândia', 'Mimoso do Sul', 'Montanha', 'Mucurici',
  'Muniz Freire', 'Muqui', 'Nova Venécia', 'Pancas', 'Pedro Canário', 'Pinheiros',
  'Piúma', 'Ponto Belo', 'Presidente Kennedy', 'Rio Bananal', 'Rio Novo do Sul',
  'Santa Leopoldina', 'Santa Maria de Jetibá', 'Santa Teresa', 'São Domingos do Norte',
  'São Gabriel da Palha', 'São José do Calçado', 'São Mateus', 'São Roque do Canaã',
  'Serra', 'Sooretama', 'Vargem Alta', 'Venda Nova do Imigrante', 'Viana',
  'Vila Pavão', 'Vila Valério', 'Vila Velha', 'Vitória',
] as const

/**
 * Forma comparável de um nome de cidade: sem acento, sem caixa, sem espaço
 * sobrando e sem a sigla do estado grudada no fim.
 *
 * É o que faz "Vitória", "vitoria" e "Vitória - ES" caírem no mesmo lugar.
 */
export function chaveCidade(bruto: string | null | undefined): string {
  return (bruto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[,\-–]\s*(es|espirito santo)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const POR_CHAVE = new Map(CIDADES_ES.map(c => [chaveCidade(c), c]))

/**
 * A grafia oficial SÓ quando bate exato (sem acento/caixa/sigla) com uma
 * cidade do ES — senão, o que a pessoa digitou, aparado.
 *
 * É a do cadastro público desde que a cidade virou texto livre (pedido do
 * Juan, 25/09/2026: evento fora do ES, gente de fora do estado). Sem o palpite
 * por prefixo de `normalizarCidade`: com qualquer cidade do Brasil valendo,
 * "Serra Talhada" viraria "Serra" e "Santa Maria" viraria "Santa Maria de
 * Jetibá".
 */
export function grafiaDaCidade(bruto: string | null | undefined): string {
  return POR_CHAVE.get(chaveCidade(bruto)) ?? (bruto ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * O nome oficial da cidade, a partir do que a pessoa digitou.
 *
 * Devolve o que veio (só aparado) quando não reconhece: é preferível guardar
 * "Ipatinga" de alguém que mora fora do estado a apagar o dado por não estar
 * na lista.
 */
export function normalizarCidade(bruto: string | null | undefined): string {
  const chave = chaveCidade(bruto)
  if (!chave) return ''
  const exata = POR_CHAVE.get(chave)
  if (exata) return exata

  /*
   * Erro de digitação por uma letra a mais ou a menos — "Vila Velhas".
   *
   * Só aceita quando UMA cidade da lista contém a chave digitada, ou vice-versa,
   * e a diferença é de UMA letra. Sem esse teto, desde que o cadastro aceita
   * cidade de fora do ES (25/09/2026), "Serrana" viraria "Serra" e "Alegrete"
   * viraria "Alegre". Com duas candidatas o palpite viraria adivinhação, e
   * trocar a cidade de alguém por engano é pior que deixar o texto original.
   */
  const parecidas = [...POR_CHAVE.entries()]
    .filter(([k]) => (k.startsWith(chave) || chave.startsWith(k)) && Math.abs(k.length - chave.length) <= 1)
  return parecidas.length === 1 ? parecidas[0][1] : (bruto ?? '').trim()
}
