'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Truck, Search, Check, AlertTriangle, User } from 'lucide-react'
import { buscarCondutorPorCpf, cadastrarVeiculo, type CondutorEncontrado } from '@/lib/actions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'

const TIPOS = ['Caminhão', 'Van', 'Carro', 'Moto', 'Outro']

/**
 * Cadastro de veículo — o condutor vem PRIMEIRO, e o resto do formulário só
 * abre depois que ele é encontrado.
 *
 * É a regra da tabela virada em tela: todo veículo é vinculado ao CPF de
 * alguém já credenciado no evento (ver supabase/upgrade-veiculos.sql).
 * Deixar os campos da placa disponíveis antes de achar o condutor convidaria
 * a preencher tudo pra descobrir no fim que a pessoa não está na equipe —
 * é o erro que mais custa tempo em cadastro, e ele fica impossível aqui.
 */
export default function FormVeiculo({
  eventoId, dias,
}: {
  eventoId: string
  /** Dias de trabalho do evento, pra marcar quando o veículo pode entrar. */
  dias: { data: string; tipo: string }[]
}) {
  const router = useRouter()

  const [cpf, setCpf] = useState('')
  const [condutor, setCondutor] = useState<CondutorEncontrado | null>(null)
  const [erroCpf, setErroCpf] = useState<string | null>(null)
  const [buscando, startBusca] = useTransition()

  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [salvando, startSalvar] = useTransition()
  const [diasMarcados, setDiasMarcados] = useState<string[]>([])

  const buscar = (e: React.FormEvent) => {
    e.preventDefault()
    setErroCpf(null)
    setCondutor(null)
    startBusca(async () => {
      const r = await buscarCondutorPorCpf(eventoId, cpf)
      if (r.condutor) setCondutor(r.condutor)
      else setErroCpf(r.error)
    })
  }

  const salvar = (formData: FormData) => {
    setErro(null)
    setOk(null)
    startSalvar(async () => {
      const r = await cadastrarVeiculo(eventoId, formData)
      if (r.error) { setErro(r.error); return }
      setOk(`${r.placa} cadastrada para ${r.condutor}.`)
      // Limpa pra cadastrar o próximo: numa montagem chegam vários seguidos.
      setCondutor(null)
      setCpf('')
      setDiasMarcados([])
      router.refresh()
    })
  }

  const alternarDia = (d: string) =>
    setDiasMarcados(m => m.includes(d) ? m.filter(x => x !== d) : [...m, d])

  return (
    <div className="space-y-4">
      {ok && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl p-3">
          <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <p className="text-green-800 text-sm font-medium">{ok}</p>
        </div>
      )}

      {/* Passo 1 — o condutor */}
      <form onSubmit={buscar} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div>
          <p className="text-slate-800 font-semibold text-sm">1. Quem vai dirigir</p>
          <p className="text-slate-400 text-xs mt-0.5">
            O condutor precisa estar credenciado neste evento — é ele que responde pelo veículo.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            required
            value={cpf}
            onChange={e => { setCpf(formatCpf(e.target.value)); setErroCpf(null) }}
            placeholder="CPF do condutor"
            className="input flex-1"
            autoComplete="off"
            inputMode="numeric"
          />
          <button type="submit" disabled={buscando} className="btn btn-secundario shrink-0">
            <Search className="w-4 h-4" />
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {erroCpf && (
          <p className="flex items-start gap-1.5 text-red-600 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erroCpf}
          </p>
        )}
        {condutor && (
          <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-slate-500" />
            </div>
            <div className="min-w-0">
              <p className="text-slate-800 text-sm font-semibold truncate">{condutor.nome}</p>
              <p className="text-slate-400 text-2xs truncate">
                {formatCpf(condutor.cpf)} · {condutor.setorNome}{condutor.cargo ? ` · ${condutor.cargo}` : ''}
              </p>
            </div>
          </div>
        )}
      </form>

      {/* Passo 2 — o veículo. Só existe depois que o condutor foi achado. */}
      {condutor && (
        <form action={salvar} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <input type="hidden" name="cpf" value={condutor.cpf} />
          {diasMarcados.map(d => <input key={d} type="hidden" name="dias" value={d} />)}

          <div>
            <p className="text-slate-800 font-semibold text-sm">2. O veículo</p>
            <p className="text-slate-400 text-xs mt-0.5">Placa e modelo são obrigatórios.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-600 text-xs font-medium block mb-1">Placa *</label>
              <input
                required name="placa" placeholder="ABC1D23"
                className="input uppercase" autoComplete="off" maxLength={8}
              />
            </div>
            <div>
              <label className="text-slate-600 text-xs font-medium block mb-1">Modelo *</label>
              <input required name="modelo" placeholder="Ex.: Mercedes Sprinter" className="input" autoComplete="off" />
            </div>
            <div>
              <label className="text-slate-600 text-xs font-medium block mb-1">Tipo</label>
              <select name="tipo" className="input" defaultValue="">
                <option value="">Não informado</option>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-600 text-xs font-medium block mb-1">Cor</label>
              <input name="cor" placeholder="Ex.: Branco" className="input" autoComplete="off" />
            </div>
          </div>

          <div>
            <label className="text-slate-600 text-xs font-medium block mb-1">
              Empresa <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              name="empresa" defaultValue={condutor.empresa ?? ''}
              placeholder="De quem é o veículo" className="input" autoComplete="off"
            />
          </div>

          {/*
            * Sem nenhum dia marcado = vale todos os dias do evento. É o caso
            * comum (o caminhão da montagem vai e volta a semana inteira), e
            * obrigar a marcar os onze dias pra dizer "todos" seria trabalho
            * repetido em cada cadastro.
            */}
          {dias.length > 0 && (
            <div>
              <label className="text-slate-600 text-xs font-medium block mb-1">
                Dias autorizados <span className="text-slate-400 font-normal">(nenhum marcado = todos)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {dias.map(d => {
                  const marcado = diasMarcados.includes(d.data)
                  return (
                    <button
                      key={d.data} type="button" onClick={() => alternarDia(d.data)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        marcado
                          ? 'bg-brand-500 border-brand-500 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
                      }`}
                    >
                      {formatarBR(`${d.data}T12:00:00-03:00`, 'data').slice(0, 5)}
                      {d.tipo === 'principal' && <span className="ml-1 opacity-70">·evento</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label className="text-slate-600 text-xs font-medium block mb-1">
              Observações <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              name="observacoes" className="input" autoComplete="off"
              placeholder="Ex.: carga frágil, entra só após as 22h"
            />
          </div>

          {erro && (
            <p className="flex items-start gap-1.5 text-red-600 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
            </p>
          )}

          <button type="submit" disabled={salvando} className="btn btn-primario w-full">
            <Truck className="w-4 h-4" />
            {salvando ? 'Cadastrando…' : 'Cadastrar veículo'}
          </button>
        </form>
      )}
    </div>
  )
}
