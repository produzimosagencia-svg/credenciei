'use client'
import { useState } from 'react'
import ScannerView from './ScannerView'
import FaceScannerView from './FaceScannerView'

type Evento = { id: string; nome: string }
type Modo = 'qr' | 'rosto'

/** O que o MÉTODO do evento manda abrir, por padrão. */
function modoDoEvento(metodo: string | undefined): Modo {
  return metodo === 'biometria' || metodo === 'biometria_qr' ? 'rosto' : 'qr'
}

/**
 * Decide, em DOIS passos, o que o operador vê — nunca os dois ao mesmo
 * tempo (bug relatado pelo Juan, 01/10/2026: com mais de um evento no
 * acesso, "Qual área você vai atuar?" aparecia junto com o resto da tela,
 * tudo empilhado, antes de o operador sequer ter escolhido o evento):
 *
 *  1. QUAL EVENTO — só pergunta quando há mais de um disponível (ou nenhum
 *     veio fixo por link/totem). Escolhido um evento sem subeventos, vai
 *     direto pra câmera — exatamente o padrão de sempre.
 *  2. QUAL ÁREA — só DEPOIS do passo 1, e só se O EVENTO ESCOLHIDO usar
 *     subeventos (mora dentro de `ScannerView`/`FaceScannerView`, que só
 *     montam depois que o passo 1 está resolvido).
 *
 * Dentro do passo 1 mora também QR-ou-rosto, pelo MÉTODO do evento
 * escolhido (outro bug do mesmo relato: o leitor abria sempre em
 * biometria, preso ao método do 1º evento da lista, mesmo trocando pra um
 * evento de QR). Master (e sócios com o mesmo acesso) fogem dessa regra:
 * veem as DUAS opções numa chave fixa em cima, pra qualquer evento.
 */
export default function ScannerRouter({
  eventos, initialEventoId, metodosPorEvento, subeventosPorEvento = {}, noPainel = false, portaoNome = null, ehMasterOperador = false,
}: {
  eventos: Evento[]
  initialEventoId?: string
  metodosPorEvento: Record<string, string>
  /** Subeventos de cada evento (Vital, 30/09/2026) — vazio/ausente = evento sem subeventos. */
  subeventosPorEvento?: Record<string, { id: string; nome: string }[]>
  /** Dentro do painel (/admin/scanner) — só afeta o leitor de QR; o leitor de
   *  rosto continua em tela cheia escura (é assim que a câmera precisa ser mostrada). */
  noPainel?: boolean
  /** Nome do portão deste totem (ex.: "Entrada VIP") — ver `perfis.portao_nome`. */
  portaoNome?: string | null
  /** Master (e sócios com o mesmo acesso): ver o comentário acima. */
  ehMasterOperador?: boolean
}) {
  // Vazio = ainda não escolhido, força o passo 1. Só nasce já preenchido
  // quando só existe UM evento possível, ou quando a navegação já veio
  // amarrada a um evento específico (ex.: "Escanear QR" de dentro dele).
  const eventoFixo = initialEventoId || (eventos.length === 1 ? eventos[0]?.id : '') || ''
  const [eventoAtivo, setEventoAtivo] = useState(eventoFixo)
  const [modo, setModo] = useState<Modo>(modoDoEvento(metodosPorEvento[eventoFixo]))
  // Reabre o passo 1 por escolha do operador (botão "Trocar"), mesmo já
  // tendo um evento ativo.
  const [escolhendoEvento, setEscolhendoEvento] = useState(false)

  const precisaEscolherEvento = !eventoAtivo
  const mostrarEscolhaEvento = precisaEscolherEvento || escolhendoEvento

  /** Passo 1 resolvido: evento escolhido, modo recalculado pelo método DELE. */
  const confirmarEvento = (id: string) => {
    setEventoAtivo(id)
    if (!ehMasterOperador) setModo(modoDoEvento(metodosPorEvento[id]))
    setEscolhendoEvento(false)
  }

  if (mostrarEscolhaEvento) {
    /*
     * `fixed inset-0`, não `flex-1` — dentro do /admin/scanner (painel,
     * tema claro) esta tela não tem um pai `flex` de altura cheia por trás
     * (só um `<div className="space-y-5">`), então `flex-1` não tinha pra
     * onde crescer e a caixa só abraçava o próprio conteúdo, deixando um
     * vazio enorme embaixo (reportado pelo Juan, 01/10/2026: "que porra de
     * layout é esse"). Fixo cobre a tela inteira sempre, não importa a
     * página por trás.
     */
    return (
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-slate-900 px-6 overflow-y-auto">
        <div className="w-full max-w-sm text-white py-8">
          <p className="text-lg font-bold text-center">Qual evento você vai trabalhar?</p>
          <div className="mt-5 space-y-2 max-h-[55vh] overflow-y-auto">
            {eventos.map(e => (
              <button
                key={e.id}
                type="button"
                onClick={() => confirmarEvento(e.id)}
                className={`w-full text-left rounded-xl px-4 py-3.5 border transition-colors ${
                  e.id === eventoAtivo
                    ? 'bg-brand-500 border-brand-500 text-white'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <span className="font-semibold">{e.nome}</span>
              </button>
            ))}
          </div>
          {!!eventoAtivo && (
            <button
              type="button"
              onClick={() => setEscolhendoEvento(false)}
              className="mt-4 w-full text-center text-white/50 text-sm font-semibold hover:text-white transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    )
  }

  const metodoAtual = metodosPorEvento[eventoAtivo] ?? 'qr'
  const eventoUsaOsDois = metodoAtual === 'biometria_qr'
  const abrirEscolhaEvento = eventos.length > 1 ? () => setEscolhendoEvento(true) : undefined

  /*
   * `text-white/50`, NÃO `text-slate-400` — dentro do /admin/scanner
   * (painel no tema claro), `--color-slate-400` vira quase preto (pensado
   * pra texto sutil sobre fundo CLARO — ver globals.css,
   * `html[data-tema="claro"]`). Este pill continua escuro-fixo em
   * qualquer tema (`bg-[#161b22]`, não adapta), então texto quase preto
   * em cima dele ficava invisível — "BIOMETRIA" sumia por completo
   * (reportado pelo Juan, 01/10/2026). `white/50` não depende de tema
   * nenhum.
   */
  const chaveDeModoMaster = ehMasterOperador && (
    <div className="px-4 pt-4 pb-1">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#161b22] border border-[#30363d]">
        <button
          type="button"
          onClick={() => setModo('qr')}
          className={`rounded-lg py-2 text-xs font-bold tracking-wide transition-all ${
            modo === 'qr' ? 'bg-brand-500 text-white shadow' : 'text-white/50 hover:text-white'
          }`}
        >
          QR CODE
        </button>
        <button
          type="button"
          onClick={() => setModo('rosto')}
          className={`rounded-lg py-2 text-xs font-bold tracking-wide transition-all ${
            modo === 'rosto' ? 'bg-brand-500 text-white shadow' : 'text-white/50 hover:text-white'
          }`}
        >
          BIOMETRIA
        </button>
      </div>
    </div>
  )

  // `key={eventoAtivo}`: remonta o leitor do zero a cada evento diferente —
  // câmera, estado de área, tudo começa limpo pro evento certo, sem precisar
  // sincronizar nada entre as duas pontas.
  if (modo === 'rosto') {
    return (
      <div className="flex-1 flex flex-col">
        {chaveDeModoMaster}
        <FaceScannerView
          key={eventoAtivo}
          eventos={eventos}
          initialEventoId={eventoAtivo}
          aoTrocarEvento={abrirEscolhaEvento}
          aoTrocarParaQr={() => setModo('qr')}
          portaoNome={portaoNome}
          subeventosPorEvento={subeventosPorEvento}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      {chaveDeModoMaster}
      <ScannerView
        key={eventoAtivo}
        eventos={eventos}
        initialEventoId={eventoAtivo}
        aoTrocarEvento={abrirEscolhaEvento}
        noPainel={noPainel}
        subeventosPorEvento={subeventosPorEvento}
      />
      {/*
        * "Usar reconhecimento facial" — só faz sentido oferecer aqui quando
        * o PRÓPRIO evento aceita os dois formatos (senão seria oferecer
        * biometria num evento que não é de biometria nenhuma). Master já
        * tem a chave fixa acima, então este link ficaria duplicado.
        */}
      {eventoUsaOsDois && !ehMasterOperador && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => setModo('rosto')}
            className="w-full text-xs font-semibold text-slate-400 border border-slate-700 rounded-lg py-2 hover:bg-slate-800 transition-colors"
          >
            Usar reconhecimento facial
          </button>
        </div>
      )}
    </div>
  )
}
