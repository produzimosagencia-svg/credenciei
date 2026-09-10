/**
 * O loading do sistema é a MARCA girando — nunca um spinner genérico.
 *
 * Um componente só, reutilizável em tela cheia ou embutido num botão. Novos
 * módulos importam daqui e não inventam outro loading. A logo é a que já
 * existe (`public/marca/iso-laranja.png`) — sem recriar, sem mexer na
 * identidade.
 *
 * ─── COMO USAR ──────────────────────────────────────────────────────────────
 *
 *   <LogoLoading />                     // média, embutida (padrão)
 *   <LogoLoading tamanho="xs" />        // dentro de um botão, no lugar do ícone
 *   <LogoLoading tamanho={28} />        // px na medida exata
 *
 *   <LoadingTela />                     // página inteira: marca grande, centralizada
 *   <LoadingTela mensagem="Salvando..." />
 *   <LoadingTela sobreConteudo />       // véu por cima do que já está na tela
 *
 * Não é 'use client': é CSS + <img>, serve Server e Client Component igual
 * (inclusive os `loading.tsx` de rota). A animação `marca-girando` e o
 * respeito a `prefers-reduced-motion` moram no globals.css.
 */

type Tamanho = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const PX: Record<Tamanho, number> = {
  xs: 16, // ícone de botão
  sm: 22, // linha de texto, item de lista
  md: 40, // card, modal pequeno
  lg: 64, // seção vazia carregando
  xl: 96, // tela inteira
}

function medida(t: Tamanho | number): number {
  return typeof t === 'number' ? t : PX[t]
}

/**
 * A marca girando, sozinha. É o "loading compacto" — ocupa só o quadrado do
 * tamanho pedido, sem texto e sem fundo, pra caber onde for (botão, célula,
 * cabeçalho de card).
 *
 * Por padrão é DECORATIVO (`aria-hidden`): num botão "Salvando…" ou numa linha
 * "Carregando o histórico…" o texto ao lado já anuncia o estado, e um
 * `role="status"` a mais só faz o leitor de tela repetir. Passe `rotulo`
 * quando a marca aparece SOZINHA, sem texto que a explique — aí ela vira um
 * status anunciável.
 */
export function LogoLoading({
  tamanho = 'md',
  className = '',
  rotulo,
}: {
  tamanho?: Tamanho | number
  className?: string
  /** Só quando a marca aparece sem texto ao lado: vira `role="status"` com este rótulo. */
  rotulo?: string
}) {
  const px = medida(tamanho)
  const acess = rotulo
    ? { role: 'status' as const, 'aria-label': rotulo, 'aria-live': 'polite' as const }
    : { 'aria-hidden': true as const }
  return (
    <span
      {...acess}
      className={`marca-girando inline-grid place-items-center shrink-0 ${className}`}
      style={{ width: px, height: px, verticalAlign: '-0.15em' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marca/iso-laranja.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="marca-girando-pulso"
        style={{ width: px, height: px, objectFit: 'contain' }}
      />
    </span>
  )
}

/**
 * Loading de página inteira: marca grande no centro, com uma frase opcional.
 *
 * `sobreConteudo` põe um véu escuro por cima do que já está na tela (pra ação
 * demorada — salvar, importar, excluir); sem ele, cobre com o fundo do
 * sistema (pra troca de módulo / rota carregando, quando não há o que
 * mostrar ainda).
 */
export function LoadingTela({
  mensagem,
  sobreConteudo = false,
}: {
  mensagem?: string
  sobreConteudo?: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={mensagem ?? 'Carregando'}
      className={`fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 p-6 ${
        sobreConteudo ? '' : 'bg-[var(--background)]'
      }`}
    >
      {sobreConteudo && <div className="overlay-fade-in absolute inset-0 bg-black/45" />}
      <div
        className={
          sobreConteudo
            ? 'modal-pop-in relative flex flex-col items-center gap-4 rounded-2xl bg-white px-12 py-9 shadow-xl'
            : 'relative flex flex-col items-center gap-4'
        }
      >
        <LogoLoading tamanho="xl" />
        {mensagem && (
          <p className={`text-sm font-semibold ${sobreConteudo ? 'text-slate-700' : 'text-slate-500'}`}>
            {mensagem}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Loading da ÁREA DE CONTEÚDO — a marca grande, centralizada onde a página
 * vai aparecer, com a barra lateral intacta. É o que todo `loading.tsx` de
 * rota usa: ao trocar de tela, em vez de skeleton (que a pessoa lê como
 * "quebrado"), aparece a marca girando até o conteúdo ficar pronto.
 *
 * Ocupa a altura da viewport menos o cabeçalho (~4rem), pra ficar no meio da
 * área e não colado no topo.
 */
export function LoadingConteudo({ mensagem }: { mensagem?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={mensagem ?? 'Carregando'}
      className="flex min-h-[65vh] w-full flex-col items-center justify-center gap-4"
    >
      <LogoLoading tamanho="xl" />
      {mensagem && <p className="text-sm font-semibold text-slate-500">{mensagem}</p>}
    </div>
  )
}

export default LogoLoading
