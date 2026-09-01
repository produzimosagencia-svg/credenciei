'use client'
import { useEffect, useRef, useState } from 'react'
import { X, CameraOff, ScanLine, Loader2 } from 'lucide-react'
import { emNavegadorEmbutido, copiarTexto } from '@/lib/navegador'

/**
 * A câmera do funcionário lendo o QR IMPRESSO no local.
 *
 * Inverte o fluxo tradicional: em vez de o credenciamento ler o crachá de
 * cada pessoa, cada pessoa lê o mesmo cartaz. Serve para entrada e saída, e
 * resolve o buraco de quando não há ninguém no portão — depois que a equipe
 * de credenciamento vai embora, mas ainda tem gente para se descredenciar.
 *
 * ─── POR QUE ISTO NÃO É A ÚNICA SAÍDA ───────────────────────────────────────
 *
 * A câmera não abre dentro do navegador embutido do WhatsApp — e é por
 * WhatsApp que o link da credencial chega. Por isso o botão direto de
 * registrar continua na tela, ao lado: quem cair aqui e não conseguir usar a
 * câmera não fica preso, só perde a prova extra de estar no local.
 */
export default function EscanearLocal({
  aoLer, aoFechar,
}: {
  /** Recebe o token extraído do cartaz. A validação de verdade é no servidor. */
  aoLer: (tokenDoLocal: string) => void
  aoFechar: () => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [lendo, setLendo] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null)
  const jaLeuRef = useRef(false)

  useEffect(() => {
    let vivo = true

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (!vivo) return
      const leitor = new Html5Qrcode('leitor-do-local')
      scannerRef.current = leitor
      leitor.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (texto: string) => {
          // Uma leitura só: o scanner dispara em rajada enquanto o código
          // estiver na frente da câmera, e sem isto o registro sairia várias
          // vezes seguidas.
          if (jaLeuRef.current) return
          jaLeuRef.current = true
          setLendo(true)
          aoLer(extrairToken(texto))
        },
        () => {}
      ).catch(() => {
        /*
         * Mesma lição do scanner do portão: falha de câmera não pode ser
         * silenciosa. Aqui o custo de errar é maior ainda, porque quem está
         * do outro lado é o funcionário, sem ninguém do lado para ajudar.
         */
        if (!vivo) return
        setErro(emNavegadorEmbutido()
          ? 'A câmera não abre por dentro do WhatsApp. Toque em "Copiar link", abra o Chrome ou o Safari e cole lá — ou feche isto e use o botão de registrar direto.'
          : 'Não conseguimos abrir a câmera. Permita o acesso à câmera para este site, ou feche isto e use o botão de registrar direto.')
      })
    })

    return () => {
      vivo = false
      if (scannerRef.current?.isScanning) scannerRef.current.stop().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <p className="text-white font-bold text-sm">Escaneie o QR do local</p>
        <button onClick={aoFechar} aria-label="Fechar" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-5 gap-4">
        {erro ? (
          <div className="w-full max-w-sm bg-red-950/40 border border-red-800 rounded-xl p-4 text-center">
            <CameraOff className="w-8 h-8 text-red-400 mx-auto" />
            <p className="text-red-200 font-semibold text-sm mt-2">A câmera não abriu</p>
            <p className="text-red-300/90 text-xs mt-1.5 leading-relaxed">{erro}</p>
            <button
              onClick={async () => {
                if (await copiarTexto(window.location.href)) {
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 5000)
                }
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 active:scale-95 transition-all px-3 py-2 rounded-lg"
            >
              {copiado ? 'Link copiado!' : 'Copiar link'}
            </button>
            <button onClick={aoFechar} className="block w-full mt-3 pt-3 border-t border-red-800/60 text-red-200 text-xs font-semibold hover:text-white">
              Voltar e registrar sem escanear →
            </button>
          </div>
        ) : (
          <>
            <div className="relative w-full max-w-sm">
              <div id="leitor-do-local" className="rounded-xl overflow-hidden" />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-56 h-56 border-2 border-brand-400 rounded-2xl opacity-70" />
              </div>
            </div>
            <p className="text-slate-400 text-sm flex items-center gap-2 text-center">
              {lendo
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando…</>
                : <><ScanLine className="w-4 h-4" /> Aponte para o cartaz na entrada</>}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * O cartaz contém a URL completa da portaria; o que interessa é o último
 * pedaço dela.
 *
 * Aceita o texto cru também: se um dia o cartaz for reimpresso com só o
 * token, continua funcionando. Quem decide se o token vale é o servidor —
 * aqui é só extração, nunca validação.
 */
function extrairToken(texto: string): string {
  const limpo = (texto ?? '').trim()
  const match = limpo.match(/\/portaria\/([^/?#\s]+)/)
  return match ? match[1] : limpo
}
