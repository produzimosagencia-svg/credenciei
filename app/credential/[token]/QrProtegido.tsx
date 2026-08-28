'use client'
import { useEffect, useState } from 'react'
import { EyeOff, ShieldAlert } from 'lucide-react'

/**
 * O QR Code da credencial, com as proteções que a plataforma web permite.
 *
 * ─── SEJA HONESTO SOBRE O QUE ISTO FAZ ──────────────────────────────────────
 *
 * O que está aqui ATRAPALHA a captura, não impede:
 *
 * - salvar/copiar a imagem: menu de contexto, arrastar e seleção bloqueados;
 * - impressão: o QR some no `@media print`, então Ctrl+P não leva nada;
 * - tela em segundo plano: o QR some e só volta com um toque, o que atrapalha
 *   gravação de tela e quem passa o aparelho desbloqueado para outra pessoa.
 *
 * Nenhuma dessas travas para quem quer mesmo: o navegador NÃO avisa quando
 * alguém tira um print — não existe API para isso em iOS nem em Android — e,
 * mesmo que existisse, dá para fotografar a tela com um segundo celular.
 *
 * O código dentro do QR não expira (decisão do cliente), então um print
 * continua valendo. A defesa que resta contra crachá emprestado é humana e já
 * existe no fluxo: o scanner mostra NOME, empresa e função de quem está sendo
 * lido, e quem credencia vê na hora se confere com a pessoa à sua frente.
 */

export default function QrProtegido({ dataUrl }: { dataUrl: string }) {
  const [oculto, setOculto] = useState(false)

  // Esconde quando a tela sai de foco. É o sinal mais próximo de "alguém está
  // capturando" que a web oferece, e cobre também o caso de passar o aparelho
  // desbloqueado para outra pessoa.
  useEffect(() => {
    const esconder = () => setOculto(true)
    const aoTrocarVisibilidade = () => {
      if (document.visibilityState === 'hidden') esconder()
    }
    document.addEventListener('visibilitychange', aoTrocarVisibilidade)
    window.addEventListener('blur', esconder)
    return () => {
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade)
      window.removeEventListener('blur', esconder)
    }
  }, [])

  return (
    <div className="text-center" data-tutorial="cred-qr">
      <div
        className="relative mx-auto w-[200px] h-[200px] rounded-xl border border-slate-100 overflow-hidden select-none"
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        onContextMenu={e => e.preventDefault()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt="QR code da credencial"
          width={200}
          height={200}
          draggable={false}
          onDragStart={e => e.preventDefault()}
          // print:hidden — o QR não sai em impressão nem em "salvar como PDF".
          className={`w-full h-full print:hidden transition-all ${oculto ? 'blur-xl scale-110' : ''}`}
          style={{ pointerEvents: 'none' }}
        />

        {oculto && (
          <button
            onClick={() => setOculto(false)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-900/80 text-white px-3"
          >
            <EyeOff className="w-6 h-6" />
            <span className="font-bold text-xs">QR ocultado por segurança</span>
            <span className="text-white/70 text-2xs leading-tight">Toque para mostrar de novo</span>
          </button>
        )}

        {/* Substitui o QR no papel, para o print sair sem nada aproveitável. */}
        <div className="hidden print:flex absolute inset-0 items-center justify-center text-center px-4 border border-dashed border-slate-300 rounded-xl">
          <span className="text-slate-500 text-xs">
            O QR Code não pode ser impresso. Apresente a tela do celular no credenciamento.
          </span>
        </div>
      </div>

      <p className="text-slate-400 text-xs mt-2">
        Apresente este QR code na <strong>entrada</strong> e na <strong>saída</strong> do evento
      </p>

      <p className="text-slate-400 text-2xs mt-1.5 flex items-center justify-center gap-1">
        <ShieldAlert className="w-3 h-3 shrink-0" />
        Esta credencial é pessoal. Emprestar o QR é uso indevido.
      </p>
    </div>
  )
}
