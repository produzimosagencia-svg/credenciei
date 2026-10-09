/*
 * Os links do Instagram e do site (credenciei.com.br) que saem de dentro do sistema — sempre por aqui, nunca
 * escritos à mão na tela: passam pela rota /ir, que grava o clique (`cliques_links`) e só então manda a pessoa
 * pro destino. Pedido do Juan, 09/10/2026: saber quantos clicam e quem.
 *
 * Mesmo desenho do /wa (WhatsApp comercial): o destino é uma lista FECHADA — /ir nunca redireciona pra um
 * endereço que veio na URL, senão vira um desvio aberto que qualquer um usa pra disfarçar link.
 */

export const DESTINOS = {
  instagram: 'https://www.instagram.com/credenciei',
  site: 'https://credenciei.com.br',
} as const
export type DestinoClique = keyof typeof DESTINOS

export const ORIGENS = ['landing', 'credencial', 'formulario', 'pdf'] as const
export type OrigemClique = (typeof ORIGENS)[number]

export const ROTULO_DESTINO: Record<DestinoClique, string> = { instagram: 'Instagram', site: 'Site (credenciei.com.br)' }
export const ROTULO_ORIGEM: Record<OrigemClique, string> = {
  landing: 'Página inicial do site',
  credencial: 'Credencial do colaborador',
  formulario: 'Formulário de cadastro',
  pdf: 'PDF de entrega de valor',
}

/**
 * O endereço rastreado. Relativo por padrão (as telas do sistema); `base` para quando o link sai do site
 * (o PDF, que é aberto fora do navegador).
 */
export function linkRastreado(
  para: DestinoClique, de: OrigemClique,
  quem: { evento?: string | null; setor?: string | null; pessoa?: string | null } = {}, base = '',
): string {
  const q = new URLSearchParams({ para, de })
  if (quem.evento) q.set('evento', quem.evento)
  if (quem.setor) q.set('setor', quem.setor)
  if (quem.pessoa) q.set('pessoa', quem.pessoa)
  return `${base.replace(/\/$/, '')}/ir?${q.toString()}`
}
