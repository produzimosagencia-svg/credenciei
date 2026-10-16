'use client'
import { useState, useTransition } from 'react'
import { UserPlus, X, AlertTriangle } from 'lucide-react'
import { adicionarPessoaNaLista, editarPessoaDaLista } from '@/lib/actions-lista-manual'
import { lerPessoaDaLista, type PessoaDaLista } from '@/lib/lista-manual-regras'
import { NomeInput, CpfInput, TelefoneInput } from '@/components/inputs'
import SeletorLista from '@/components/SeletorLista'

const NOVA_CATEGORIA = '__nova__'

/**
 * "Adicionar pessoa à lista" — e a correção do cadastro (com `pessoa`). Feito pelo admin dentro do sistema: sem link,
 * sem formulário público, sem QR. A mesma régua da tela vale no servidor (`lerPessoaDaLista`).
 */
export default function FormPessoaLista({
  eventoId, categorias, pessoa, onFechar, onSalvo,
}: {
  eventoId: string
  categorias: string[]
  /** Corrigir um cadastro (o CPF inteiro vem junto: só quem gerencia a lista abre isto). */
  pessoa?: PessoaDaLista
  onFechar: () => void
  onSalvo: (p: PessoaDaLista, nova: boolean, avisado: boolean) => void
}) {
  const [nome, setNome] = useState(pessoa?.nome ?? '')
  const [cpf, setCpf] = useState(pessoa?.cpf ?? '')
  const [telefone, setTelefone] = useState(pessoa?.telefone ?? '')
  const [categoria, setCategoria] = useState(pessoa?.categoria ?? categorias[0] ?? '')
  const [novaCategoria, setNovaCategoria] = useState('')
  // O aviso no WhatsApp (modelo `lista_manual_confirmacao`) — só no cadastro novo, e só com telefone.
  const [avisar, setAvisar] = useState(true)
  const temTelefone = telefone.replace(/\D/g, '').length >= 10
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, startSalvar] = useTransition()

  const salvar = () => {
    const entrada = { nome, cpf, telefone, categoria: categoria === NOVA_CATEGORIA ? novaCategoria : categoria }
    const lido = lerPessoaDaLista(entrada)
    if (!lido.ok) { setErro(lido.erro); return }
    setErro(null)
    startSalvar(async () => {
      const r = pessoa
        ? await editarPessoaDaLista(eventoId, pessoa.id, entrada)
        : await adicionarPessoaNaLista(eventoId, { ...entrada, avisarWhatsapp: avisar && temTelefone })
      if ('erro' in r) { setErro(r.erro); return }
      onSalvo(r.pessoa, !pessoa, 'avisado' in r && r.avisado === true)
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => !salvando && onFechar()}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h3 className="text-slate-800 font-bold text-lg">{pessoa ? 'Corrigir cadastro' : 'Adicionar pessoa à lista'}</h3>
            <p className="text-slate-500 text-sm mt-0.5">Entrada sem QR Code: na portaria, a pessoa mostra o documento e a equipe confirma.</p>
          </div>
          <button type="button" onClick={onFechar} disabled={salvando} className="text-slate-400 hover:text-slate-600" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        <form className="p-5 space-y-4 overflow-y-auto" onSubmit={e => { e.preventDefault(); salvar() }}>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="lm-nome">Nome completo *</label>
            <NomeInput id="lm-nome" defaultValue={nome} onValueChange={setNome} className="input" autoComplete="off" maxLength={120} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700" htmlFor="lm-cpf">CPF *</label>
              <CpfInput id="lm-cpf" defaultValue={cpf} onValueChange={setCpf} className="input tabular-nums" autoComplete="off" placeholder="000.000.000-00" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700" htmlFor="lm-tel">Telefone *</label>
              <TelefoneInput id="lm-tel" defaultValue={telefone} onValueChange={setTelefone} className="input tabular-nums" autoComplete="off" placeholder="(00) 00000-0000" />
            </div>
          </div>
          <p className="text-slate-400 text-xs -mt-2">O CPF é o que a portaria confere com o documento.</p>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Categoria *</span>
            <SeletorLista
              className="w-full" valor={categoria} onChange={setCategoria} titulo="Categoria da entrada"
              opcoes={[...categorias.map(c => ({ valor: c, rotulo: c })), { valor: NOVA_CATEGORIA, rotulo: '+ Nova categoria…' }]}
            />
            {categoria === NOVA_CATEGORIA && (
              <input
                value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} maxLength={40} autoFocus
                className="input" placeholder="Ex.: Imprensa, Patrocinador, Camarim"
              />
            )}
          </div>
          {!pessoa && (
            <label className={`flex items-start gap-2.5 text-sm ${temTelefone ? 'text-slate-700 cursor-pointer' : 'text-slate-400'}`}>
              <input type="checkbox" checked={avisar && temTelefone} disabled={!temTelefone} onChange={e => setAvisar(e.target.checked)} className="w-4 h-4 mt-0.5 accent-brand-500" />
              <span>Avisar pelo WhatsApp que o nome está na lista{!temTelefone && ' (precisa do telefone)'}</span>
            </label>
          )}
          {erro && <p className="flex items-start gap-1.5 text-red-600 text-sm"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{erro}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={salvando} className="btn btn-primario flex-1 justify-center disabled:opacity-60">
              <UserPlus className="w-4 h-4 shrink-0" /> {salvando ? 'Salvando…' : pessoa ? 'Salvar correção' : 'Adicionar à lista'}
            </button>
            <button type="button" onClick={onFechar} disabled={salvando} className="btn btn-secundario">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}
