'use client'
import { useState, useTransition } from 'react'
import { X, Pencil, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { atualizarServico, criarServicoPersonalizado, excluirServicoPersonalizado, type ServicoInput } from '@/lib/actions-performance'
import { ROTULO_CATEGORIA, CATEGORIAS_SERVICO } from '@/lib/performance-constantes'
import type { Servico } from '@/lib/performance'
import SeletorLista from '@/components/SeletorLista'

export default function ConfigServicos({ servicos }: { servicos: Servico[] }) {
  const [editando, setEditando] = useState<Servico | null>(null)
  const [criando, setCriando] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setCriando(true)} className="btn btn-primario"><Plus className="w-4 h-4" /> Novo serviço</button>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="tabela">
          <thead>
            <tr>
              <th>Serviço</th><th>Categoria</th><th>Habilitado</th><th>Intervalo</th><th>Atenção/Crítico</th><th></th>
            </tr>
          </thead>
          <tbody>
            {servicos.map(s => (
              <tr key={s.id}>
                <td>
                  <p className="text-slate-800 font-medium">{s.nome}</p>
                  <p className="text-slate-400 text-2xs font-mono">{s.chave}</p>
                </td>
                <td className="text-slate-500 text-sm">{ROTULO_CATEGORIA[s.categoria]}</td>
                <td>{s.habilitado ? <span className="text-green-600 text-sm font-semibold">Sim</span> : <span className="text-slate-400 text-sm">Não</span>}</td>
                <td className="text-slate-500 text-sm tabular-nums">{s.intervaloSegundos}s</td>
                <td className="text-slate-500 text-sm tabular-nums">{s.limiarAtencaoMs}ms / {s.limiarCriticoMs}ms</td>
                <td className="text-right">
                  <button onClick={() => setEditando(s)} className="btn-press p-1.5 text-slate-400 hover:text-brand-600 rounded-lg" aria-label={`Editar ${s.nome}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && <ModalEditar servico={editando} onFechar={() => setEditando(null)} />}
      {criando && <ModalCriar onFechar={() => setCriando(false)} />}
    </div>
  )
}

function ModalEditar({ servico, onFechar }: { servico: Servico; onFechar: () => void }) {
  const [dados, setDados] = useState<ServicoInput>({
    habilitado: servico.habilitado, intervaloSegundos: servico.intervaloSegundos, timeoutMs: servico.timeoutMs,
    limiarAtencaoMs: servico.limiarAtencaoMs, limiarCriticoMs: servico.limiarCriticoMs,
  })
  const [erro, setErro] = useState<string | null>(null)
  const [excluirConfirmando, setExcluirConfirmando] = useState(false)
  const [salvando, startSalvar] = useTransition()

  const ehServicoDoSeed = !!servico.endpoint || ['api', 'banco', 'storage', 'dominio_ssl', 'whatsapp', 'fila_mensagens', 'gemini', 'google', 'email', 'conferencia_equipe'].includes(servico.chave)

  const salvar = () => {
    setErro(null)
    startSalvar(async () => {
      const r = await atualizarServico(servico.id, dados)
      if (!r.ok) { setErro(r.erro); return }
      onFechar()
    })
  }

  const excluir = () => {
    setErro(null)
    startSalvar(async () => {
      const r = await excluirServicoPersonalizado(servico.id)
      if (!r.ok) { setErro(r.erro); return }
      onFechar()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-slate-800 font-bold text-sm">{servico.nome}</h3>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={dados.habilitado} onChange={e => setDados(d => ({ ...d, habilitado: e.target.checked }))} />
          <span className="text-slate-700 text-sm">Habilitado</span>
        </label>

        <Campo rotulo="Intervalo entre checagens (segundos)">
          <input type="number" min={30} className="input" value={dados.intervaloSegundos}
            onChange={e => setDados(d => ({ ...d, intervaloSegundos: Number(e.target.value) }))} />
        </Campo>
        <Campo rotulo="Timeout (ms)">
          <input type="number" min={1000} className="input" value={dados.timeoutMs}
            onChange={e => setDados(d => ({ ...d, timeoutMs: Number(e.target.value) }))} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Limiar atenção (ms)">
            <input type="number" min={1} className="input" value={dados.limiarAtencaoMs}
              onChange={e => setDados(d => ({ ...d, limiarAtencaoMs: Number(e.target.value) }))} />
          </Campo>
          <Campo rotulo="Limiar crítico (ms)">
            <input type="number" min={1} className="input" value={dados.limiarCriticoMs}
              onChange={e => setDados(d => ({ ...d, limiarCriticoMs: Number(e.target.value) }))} />
          </Campo>
        </div>

        {erro && <p className="flex items-start gap-1.5 text-red-600 text-xs"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}</p>}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
          {!ehServicoDoSeed && (
            excluirConfirmando ? (
              <div className="flex items-center gap-1.5">
                <span className="text-red-600 text-xs">Excluir de vez?</span>
                <button onClick={excluir} disabled={salvando} className="text-red-600 text-xs font-bold">Sim</button>
                <button onClick={() => setExcluirConfirmando(false)} className="text-slate-400 text-xs">Não</button>
              </div>
            ) : (
              <button onClick={() => setExcluirConfirmando(true)} className="text-red-600 text-xs font-semibold flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            )
          )}
          <button onClick={salvar} disabled={salvando} className="btn btn-primario btn-sm ml-auto">{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

function ModalCriar({ onFechar }: { onFechar: () => void }) {
  const [chave, setChave] = useState('')
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [categoria, setCategoria] = useState<string>('integracoes')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, startSalvar] = useTransition()

  const salvar = () => {
    setErro(null)
    startSalvar(async () => {
      const r = await criarServicoPersonalizado({ chave, nome, tipo, categoria, descricao: descricao || null })
      if (!r.ok) { setErro(r.erro); return }
      onFechar()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-slate-800 font-bold text-sm">Novo serviço</h3>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-slate-400 text-xs">
          Cadastra a entidade pra acompanhar — fica &quot;não monitorado&quot; até alguém programar o check dele.
        </p>
        <Campo rotulo="Nome"><input className="input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: API de pagamentos" /></Campo>
        <Campo rotulo="Chave (identificador)"><input className="input font-mono" value={chave} onChange={e => setChave(e.target.value)} placeholder="ex_pagamentos" /></Campo>
        <Campo rotulo="Tipo"><input className="input" value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Ex.: api, integracao, processo" /></Campo>
        <Campo rotulo="Categoria">
          <SeletorLista
            valor={categoria} onChange={setCategoria} titulo="Categoria"
            opcoes={CATEGORIAS_SERVICO.map(c => ({ valor: c, rotulo: ROTULO_CATEGORIA[c] }))}
          />
        </Campo>
        <Campo rotulo="Descrição (opcional)"><input className="input" value={descricao} onChange={e => setDescricao(e.target.value)} /></Campo>

        {erro && <p className="flex items-start gap-1.5 text-red-600 text-xs"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}</p>}

        <button onClick={salvar} disabled={salvando} className="btn btn-primario w-full">{salvando ? 'Salvando…' : 'Criar serviço'}</button>
      </div>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-slate-500 text-xs font-medium">{rotulo}</span>
      {children}
    </label>
  )
}
