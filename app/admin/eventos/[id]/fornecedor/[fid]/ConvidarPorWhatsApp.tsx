'use client'
import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Send, X, Loader2, Check, RefreshCw, AlertTriangle } from 'lucide-react'
import {
  listarConvites, convidarParaEquipe, cancelarConvite,
  type ConvitesDaEquipe, type ResultadoDoConvite, type ConviteNaTela,
} from '@/lib/actions-convites'
import { lerListaDeConvites, MAX_CONVITES_POR_VEZ } from '@/lib/convites-regras'
import { formatarBR } from '@/lib/tz'
import { Badge } from '@/components/ui/Superficie'

/*
 * CONVIDAR POR WHATSAPP (Juan, 18/10/2026) — o supervisor cola os telefones de quem quer na equipe; cada pessoa
 * recebe o link de cadastro da equipe e, 24h depois, um lembrete se não tiver se cadastrado. A lista mostra quem já
 * se cadastrou, se a mensagem chegou e quando sai o lembrete. Regras no servidor: lib/actions-convites.ts.
 */

const SITUACAO: Record<ConviteNaTela['situacao'], { texto: string; tom: 'positivo' | 'atencao' | 'neutro' }> = {
  cadastrou: { texto: 'cadastrou', tom: 'positivo' },
  aguardando: { texto: 'aguardando cadastro', tom: 'atencao' },
  lembrado: { texto: 'lembrete enviado', tom: 'atencao' },
  cancelado: { texto: 'sem lembrete', tom: 'neutro' },
}
const MENSAGEM: Record<ConviteNaTela['mensagem'], string> = {
  lida: 'mensagem lida', entregue: 'mensagem entregue', enviada: 'mensagem enviada', na_fila: 'mensagem na fila',
  falhou: 'mensagem NÃO chegou', sem_mensagem: '',
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export default function ConvidarPorWhatsApp({ fornecedorId, equipeNome }: { fornecedorId: string; equipeNome: string }) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [dados, setDados] = useState<ConvitesDaEquipe | null>(null)
  const [erroLista, setErroLista] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoDoConvite | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await listarConvites(fornecedorId)
      if ('error' in r) { setErroLista(r.error); setDados(null); return }
      setErroLista(null)
      setDados(r)
    } catch {
      setErroLista('Sem internet agora. Tente abrir de novo.')
    }
  }, [fornecedorId])

  const abrir = () => { setAberto(true); setResultado(null); setErro(null); void carregar() }

  const lidas = useMemo(() => lerListaDeConvites(texto), [texto])
  const validas = lidas.filter(l => !l.erro)
  const invalidas = lidas.filter(l => l.erro)
  const podeEnviar = !!dados?.pronto && !!dados.linkAtivo && validas.length > 0 && validas.length <= MAX_CONVITES_POR_VEZ && !enviando

  const enviar = async () => {
    setEnviando(true)
    setErro(null)
    try {
      const r = await convidarParaEquipe(fornecedorId, texto)
      if ('error' in r) { setErro(r.error); return }
      setResultado(r)
      setTexto('')
      await carregar()
    } catch {
      setErro('A internet falhou no envio. Abra a lista de convidados antes de tentar de novo: ninguém é convidado duas vezes.')
    } finally {
      setEnviando(false)
    }
  }

  const naoLembrar = async (id: string) => {
    const r = await cancelarConvite(fornecedorId, id).catch(() => ({ error: 'Sem internet.' }))
    if ('error' in r) { setErro(r.error); return }
    await carregar()
  }

  const semCadastro = dados?.convites.filter(c => c.situacao === 'aguardando' || c.situacao === 'lembrado').length ?? 0

  return (
    <>
      <button type="button" onClick={abrir} className="btn btn-secundario btn-sm">
        <Send className="w-3.5 h-3.5 shrink-0" /> Convidar por WhatsApp
      </button>

      {aberto && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Convidar por WhatsApp">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-5 pb-3">
              <div>
                <p className="text-lg font-extrabold text-slate-900">Convidar por WhatsApp</p>
                <p className="text-sm text-slate-500">{equipeNome} · cada pessoa recebe o link de cadastro; quem não se cadastrar em 24h ganha um lembrete.</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Fechar"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-5 pb-5 space-y-4 overflow-y-auto">
              {erroLista && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{erroLista}</p>
              )}
              {dados && !dados.pronto && (
                <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  O convite começa a funcionar quando a Meta aprovar o modelo de mensagem. Enquanto isso, use o botão &ldquo;Link cadastro&rdquo;.
                </p>
              )}
              {dados && dados.pronto && !dados.linkAtivo && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">O link de cadastro desta equipe está desligado. Ligue o link para poder convidar.</p>
              )}

              <div className="space-y-1.5">
                <label htmlFor="convite-lista" className="text-sm font-semibold text-slate-700">Telefones (um por linha, com ou sem o nome)</label>
                <textarea
                  id="convite-lista" value={texto} onChange={e => setTexto(e.target.value)} rows={5}
                  placeholder={'Ana Silva 27 99999-0000\n(27) 98888-1111 Bruno'}
                  className="input w-full text-sm font-mono"
                />
                {lidas.length > 0 && (
                  <p className="text-xs text-slate-500">
                    {plural(validas.length, 'telefone pronto', 'telefones prontos')}
                    {invalidas.length > 0 && <span className="text-amber-700"> · {plural(invalidas.length, 'linha sem telefone válido', 'linhas sem telefone válido')}</span>}
                    {validas.length > MAX_CONVITES_POR_VEZ && <span className="text-red-600"> · no máximo {MAX_CONVITES_POR_VEZ} por vez</span>}
                  </p>
                )}
              </div>

              {erro && <p className="text-sm text-red-600">{erro}</p>}
              <button type="button" onClick={() => void enviar()} disabled={!podeEnviar} className="btn btn-primario w-full disabled:opacity-50">
                {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</> : <><Send className="w-4 h-4" /> Enviar convite{validas.length ? ` para ${plural(validas.length, 'pessoa', 'pessoas')}` : ''}</>}
              </button>

              {resultado && (
                <div className="space-y-2 text-sm">
                  {resultado.enviados.length > 0 && (
                    <p className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-green-800">
                      <Check className="w-4 h-4 shrink-0 mt-0.5" /> {plural(resultado.enviados.length, 'convite saiu', 'convites saíram')} pelo WhatsApp.
                    </p>
                  )}
                  {resultado.ignorados.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                      <p className="font-semibold">{plural(resultado.ignorados.length, 'linha não foi convidada', 'linhas não foram convidadas')}:</p>
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {resultado.ignorados.map((i, k) => <li key={k}><span className="font-mono">{i.linha}</span>: {i.motivo}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {dados && dados.convites.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">
                      Convidados · {plural(dados.convites.filter(c => c.situacao === 'cadastrou').length, 'cadastrou', 'cadastraram')}
                      {semCadastro > 0 && <span className="text-amber-700">, {semCadastro} sem cadastro</span>}
                    </p>
                    <button type="button" onClick={() => void carregar()} className="inline-flex items-center gap-1 text-xs text-brand-600 font-semibold hover:underline">
                      <RefreshCw className="w-3 h-3" /> Atualizar
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {dados.convites.map(c => (
                      <li key={c.id} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-slate-800 truncate">{c.nome ?? 'Sem nome'} <span className="text-slate-400 font-normal tabular-nums">{c.telefone}</span></span>
                          <span className={`block text-2xs ${c.mensagem === 'falhou' ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                            convidado {formatarBR(c.criadoEm, 'curto')}
                            {MENSAGEM[c.mensagem] ? ` · ${MENSAGEM[c.mensagem]}` : ''}
                            {c.situacao === 'aguardando' && c.lembreteEm ? ` · lembrete ${formatarBR(c.lembreteEm, 'curto')}` : ''}
                          </span>
                        </span>
                        <Badge tom={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].texto}</Badge>
                        {c.situacao === 'aguardando' && (
                          <button type="button" onClick={() => void naoLembrar(c.id)} className="text-2xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline">Não lembrar</button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  )
}
