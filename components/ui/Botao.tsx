import Link from 'next/link'

/**
 * Botão do sistema.
 *
 * A aparência mora nas classes `.btn*` do globals.css — este componente só
 * monta a combinação e cuida do que CSS não resolve: obrigar rótulo em botão
 * que só tem ícone. Quem preferir escrever `className="btn btn-primario"` na
 * mão tem exatamente o mesmo resultado; não existem duas fontes de verdade.
 *
 * Sem 'use client' de propósito: assim serve Server e Client Component igual.
 * Ícone entra como filho (JSX), nunca como prop de componente — passar
 * componente do servidor pro cliente quebra em produção, e já quebrou aqui.
 */

export type VarianteBotao = 'primario' | 'secundario' | 'perigo' | 'fantasma'
export type TamanhoBotao = 'sm' | 'md' | 'lg' | 'icone' | 'icone-lg'

const TAMANHOS: Record<TamanhoBotao, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
  icone: 'btn-icone',
  'icone-lg': 'btn-icone-lg',
}

type Estilo = {
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  largura?: 'auto' | 'total'
  className?: string
}

export function classesBotao({ variante = 'primario', tamanho = 'md', largura = 'auto', className = '' }: Estilo) {
  return ['btn', `btn-${variante}`, TAMANHOS[tamanho], largura === 'total' ? 'w-full' : '', className]
    .filter(Boolean).join(' ')
}

/**
 * Botão de ícone exige rótulo: um `<button>` que só tem uma seta dentro não diz
 * nada a quem usa leitor de tela. O tipo obriga o aria-label nesses tamanhos.
 */
type SoIcone = { tamanho: 'icone' | 'icone-lg'; 'aria-label': string }
type ComTexto = { tamanho?: Exclude<TamanhoBotao, 'icone' | 'icone-lg'>; 'aria-label'?: string }

export type BotaoProps = Omit<React.ComponentProps<'button'>, 'className'> & Estilo & (SoIcone | ComTexto)

export function Botao({ variante, tamanho, largura, className, ...props }: BotaoProps) {
  return <button {...props} className={classesBotao({ variante, tamanho, largura, className })} />
}

export type BotaoLinkProps = Omit<React.ComponentProps<typeof Link>, 'className'> & Estilo & (SoIcone | ComTexto)

export function BotaoLink({ variante, tamanho, largura, className, ...props }: BotaoLinkProps) {
  return <Link {...props} className={classesBotao({ variante, tamanho, largura, className })} />
}
