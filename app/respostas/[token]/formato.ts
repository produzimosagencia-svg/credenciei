export function formatarTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, '')
  const local = d.startsWith('55') ? d.slice(2) : d
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return bruto
}

/**
 * Iniciais para o círculo da conversa.
 *
 * Percorre por caractere inteiro e só aceita letra: nome de WhatsApp vem com
 * emoji, e cortar um emoji ao meio gera um caractere quebrado que o servidor
 * e o navegador desenham de formas diferentes. Sem letra nenhuma (conversa
 * identificada só pelo telefone), fica o símbolo de número.
 */
export function iniciais(nome: string): string {
  const letras = nome.trim().split(/\s+/)
    .map(palavra => [...palavra].filter(c => /\p{L}/u.test(c)))
    .filter(l => l.length)
  if (!letras.length) return '#'
  const par = letras.length > 1 ? [letras[0][0], letras.at(-1)![0]] : letras[0].slice(0, 2)
  return par.join('').toUpperCase()
}

const ROTULO_DO_TIPO: Record<string, string> = {
  audio: 'Áudio',
  image: 'Imagem',
  video: 'Vídeo',
  document: 'Documento',
  sticker: 'Figurinha',
  unsupported: 'Mensagem em formato não suportado',
  location: 'Localização',
  contacts: 'Contato',
  reaction: 'Reação',
}

/** Mídia chega sem texto: diz o que era, em vez de deixar a linha vazia. */
export function rotuloSemTexto(tipo: string): string {
  return ROTULO_DO_TIPO[tipo] ?? '(mensagem sem texto)'
}

/*
 * Cor do círculo de cada conversa. Sai do telefone, e não da posição na lista,
 * para a mesma pessoa ter sempre a mesma cor mesmo quando a lista reordena.
 */
const CORES_DO_CIRCULO = [
  'from-[#ff7a45] to-[#e33c06]',
  'from-[#8b7bff] to-[#5a46e8]',
  'from-[#34d399] to-[#0f9f72]',
  'from-[#38bdf8] to-[#1d7fd6]',
  'from-[#f472b6] to-[#d1347f]',
  'from-[#fbbf24] to-[#d97b06]',
]

export function corDoCirculo(telefone: string): string {
  let soma = 0
  for (const digito of telefone.replace(/\D/g, '')) soma = (soma * 31 + Number(digito)) % 9973
  return CORES_DO_CIRCULO[soma % CORES_DO_CIRCULO.length]
}
