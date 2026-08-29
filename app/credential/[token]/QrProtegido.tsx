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
 * Quem de fato protege é o código: ele vale SÓ NO DIA em que foi gerado (ver
 * lib/credencial-qr.ts). Um print de ontem não passa hoje, e é isso que impede
 * o crachá de circular no grupo. Dentro do mesmo dia, a defesa é humana e já
 * existe no fluxo: o scanner mostra NOME, empresa e função de quem está sendo
 * lido, e quem credencia vê na hora se confere com a pessoa à sua frente.
 */

export default function QrProtegido(
  { dataUrl, dia, faseLabel }: { dataUrl: string; dia: string; faseLabel: string }
) {
  const [oculto, setOculto] = useState(false)

  /*
   * Recarrega sozinho na virada do dia, em Brasília.
   *
   * O código não muda mais todo dia — muda quando vira a ETAPA. Só que a etapa
   * vira exatamente na virada do dia: a última madrugada de montagem termina e
   * começa o dia do evento. Quem deixa a credencial aberta a noite toda — o
   * caso normal de quem trabalha na madrugada — acordaria com o crachá da
   * montagem na tela e seria recusado na portaria do evento sem entender por
   * quê. Por isso a recarga na virada continua.
   */
  useEffect(() => {
    const agora = Date.now()
    const viradaBRT = new Date(`${dia}T00:00:00-03:00`).getTime() + 24 * 60 * 60 * 1000
    const faltam = viradaBRT - agora
    if (faltam <= 0 || faltam > 26 * 60 * 60 * 1000) return
    const t = setTimeout(() => window.location.reload(), faltam + 2000)
    return () => clearTimeout(t)
  }, [dia])

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
        {/* Dizer de QUAL etapa é o código evita a confusão previsível: a pessoa
            mostra o crachá da montagem no dia do evento e não entende a recusa. */}
        Este é o seu QR da {faseLabel}. A credencial é pessoal — emprestar é uso indevido.
      </p>
    </div>
  )
}
