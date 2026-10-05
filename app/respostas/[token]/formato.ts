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
  location: 'Localização',
  contacts: 'Contato',
  reaction: 'Reação',
}

/** Mídia chega sem texto: diz o que era, em vez de deixar a linha vazia. */
export function rotuloSemTexto(tipo: string): string {
  return ROTULO_DO_TIPO[tipo] ?? '(mensagem sem texto)'
}
