'use client'
import { useState } from 'react'
import { X, Search, ShieldCheck, ShieldAlert, Loader2, AlertTriangle } from 'lucide-react'
import { conferirCredenciamentoPorCpf, type ConferenciaCpf as Resultado } from '@/lib/actions'

/**
 * "Esta pessoa está credenciada?" — a conferência de portão, pelo CPF.
 *
 * Abre quando o QR não serve: crachá de outra etapa do evento, tela que não
 * carrega, celular sem bateria. Sem esta saída, quem credencia fica entre
 * mandar a pessoa embora e deixar entrar sem conferir — e quando a fila
 * aperta, é sempre a segunda que acontece.
 *
 * NÃO registra ponto, de propósito. A decisão de liberar é de quem está lá,
 * com a pessoa na frente; aqui só se responde se o cadastro existe. O registro
 * continua pelo QR ou pelo registro assistido, que grava quem autorizou.
 */

const soDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 11)

const mascara = (d: string) =>
  d.length <= 3 ? d
  : d.length <= 6 ? `${d.slice(0, 3)}.${d.slice(3)}`
  : d.length <= 9 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  : `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`

const ETAPA_FEITA: Record<string, string> = { entrada: 'entrada', meio: 'meio', fim: 'saída' }

export default function ConferenciaCpf({
  eventoId, aviso, aoFechar,
}: {
  eventoId: string
  /** O motivo de ter chegado aqui — some da tela assim que há resposta. */
  aviso?: string
  aoFechar: () => void
}) {
  const [cpf, setCpf] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [res, setRes] = useState<Resultado | null>(null)

  const conferir = async () => {
    if (cpf.length !== 11 || carregando) return
    setCarregando(true)
    setRes(null)
    try {
      setRes(await conferirCredenciamentoPorCpf(eventoId, cpf))
    } catch {
      setRes({ credenciado: false, erro: 'Não foi possível consultar agora. Tente de novo.' })
    } finally {
      setCarregando(false)
    }
  }

  const recomecar = () => { setRes(null); setCpf('') }

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl">

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Conferir credenciamento</h2>
          <button onClick={aoFechar} aria-label="Fechar" className="p-1 -mr-1 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {aviso && !res && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-amber-800 text-xs">{aviso}</p>
            </div>
          )}

          {!res && (
            <>
              <label className="block">
                <span className="text-slate-600 text-xs font-medium">CPF da pessoa</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  value={mascara(cpf)}
                  onChange={e => setCpf(soDigitos(e.target.value))}
                  onKeyDown={e => { if (e.key === 'Enter') conferir() }}
                  placeholder="000.000.000-00"
                  className="mt-1 w-full text-2xl tracking-wide tabular-nums text-center font-semibold
                             border border-slate-200 rounded-xl px-3 py-3 focus:border-brand-400 focus:outline-none"
                />
              </label>
              <button
                onClick={conferir}
                disabled={cpf.length !== 11 || carregando}
                className="btn btn-primario btn-lg w-full disabled:opacity-50"
              >
                {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {carregando ? 'Consultando…' : 'Conferir'}
              </button>
            </>
          )}

          {/* Erro de uso (CPF inválido, sem permissão) — não é veredito sobre a
              pessoa, então não usa o vermelho forte do "não credenciado". */}
          {res?.erro && (
            <div className="space-y-3">
              <p className="text-slate-700 text-sm">{res.erro}</p>
              <button onClick={recomecar} className="btn btn-secundario w-full">Tentar outro CPF</button>
            </div>
          )}

          {res && !res.erro && res.credenciado && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                <ShieldCheck className="w-9 h-9 text-green-600 mx-auto" />
                <p className="text-green-800 font-bold text-lg mt-2">Credenciado neste evento</p>
                <p className="text-slate-900 font-semibold text-xl mt-3">{res.nome}</p>
                <p className="text-slate-500 text-sm">
                  {[res.cargo, res.setor].filter(Boolean).join(' • ') || '—'}
                </p>
              </div>

              {/* Ressalvas: existe cadastro, mas há algo que muda a decisão. */}
              {res.inativo && (
                <p className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-xs">
                  Cadastrada, mas <strong>ainda não ativada</strong> para trabalhar. O organizador
                  precisa ativar no painel do setor antes de liberar.
                </p>
              )}
              {res.descredenciadoEm && (
                <p className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-xs">
                  Já foi <strong>descredenciada</strong> deste evento. Para voltar, o organizador
                  precisa recredenciar no painel do setor.
                </p>
              )}

              <p className="text-slate-500 text-xs text-center">
                {res.batidasHoje?.length
                  ? `Hoje já registrou: ${res.batidasHoje.map(t => ETAPA_FEITA[t] ?? t).join(', ')}.`
                  : 'Ainda não registrou nada hoje.'}
              </p>

              {/*
                * Diz o que fazer a seguir. Confirmar que a pessoa existe não
                * marca ponto — sem esta linha, o operador sai daqui achando
                * que a entrada ficou registrada, e a batida se perde.
                */}
              <p className="text-slate-400 text-2xs text-center border-t border-slate-100 pt-3">
                Isto é só uma conferência: o ponto não foi registrado. Peça para a pessoa
                recarregar a credencial e mostrar o QR, ou registre pelo painel do setor.
              </p>
              <button onClick={recomecar} className="btn btn-secundario w-full">Conferir outro CPF</button>
            </div>
          )}

          {res && !res.erro && !res.credenciado && (
            <div className="space-y-3">
              <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 text-center">
                <ShieldAlert className="w-9 h-9 text-red-600 mx-auto" />
                <p className="text-red-800 font-bold text-lg mt-2">Não está credenciada</p>
                <p className="text-red-700 text-sm mt-2">
                  Nenhum cadastro com o CPF <strong className="tabular-nums">{mascara(cpf)}</strong> neste evento.
                </p>
              </div>
              <p className="bg-red-600 text-white rounded-xl p-3 text-sm font-semibold text-center">
                Esta pessoa não tem permissão para entrar.
              </p>
              <p className="text-slate-500 text-xs text-center">
                Se ela garante que se cadastrou, pode ter sido em outro evento, ou o CPF foi
                digitado errado. Confira o número antes de liberar — e, na dúvida, chame o
                organizador.
              </p>
              <button onClick={recomecar} className="btn btn-secundario w-full">Conferir outro CPF</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
