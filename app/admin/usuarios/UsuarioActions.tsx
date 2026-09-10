'use client'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, KeyRound, Check, AlertCircle, X, Pencil, Power } from 'lucide-react'
import { deletarUsuario, redefinirSenha, alternarAtivoUsuario, editarUsuario } from '@/lib/actions'
import { capacidadesDoPapel } from '@/lib/permissions'
import { mensagemAmigavel } from '@/lib/erros'
import ConfirmModal from '@/components/ConfirmModal'
import { MenuAcoes, ItemMenu } from '@/components/ui/MenuAcoes'
import { LogoLoading } from '@/components/LogoLoading'

export default function UsuarioActions({
  usuarioId, usuarioNome, usuarioRole, usuarioAtivo, usuarioTelefone = null,
  permissoesUsuario = {}, podeExcluir = false,
}: {
  usuarioId: string
  usuarioNome: string
  usuarioRole: string
  usuarioAtivo: boolean
  usuarioTelefone?: string | null
  /** O que já está ligado/desligado neste acesso (perfis.permissoes_usuario). */
  permissoesUsuario?: Record<string, boolean>
  /** Excluir é só do master; o resto vale pra quem gerencia acessos. */
  podeExcluir?: boolean
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [senhaAberta, setSenhaAberta] = useState(false)
  const [senha, setSenha] = useState('')
  const [editar, setEditar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const capacidades = capacidadesDoPapel(usuarioRole)
  // Estado atual de cada função (override do acesso, ou o padrão do papel).
  const [caps, setCaps] = useState<Record<string, boolean>>({})
  const capLigada = (chave: string, padrao: boolean) =>
    chave in caps ? caps[chave] : (chave in permissoesUsuario ? permissoesUsuario[chave] : padrao)

  const abrirEdicao = () => {
    // Semeia o estado com o que vale hoje, pra o form partir do valor certo.
    const seed: Record<string, boolean> = {}
    for (const c of capacidades) seed[c.chave] = capLigada(c.chave, c.padraoAtual)
    setCaps(seed)
    setEditar(true); setFeito(null); setErro(null)
  }

  const confirmarExclusao = () => {
    startTransition(async () => {
      try {
        await deletarUsuario(usuarioId)
        router.refresh()
        setConfirmOpen(false)
      } catch (e: unknown) {
        setConfirmOpen(false)
        setErro(mensagemAmigavel(e))
      }
    })
  }

  const trocarSenha = () => {
    setErro(null); setFeito(null)
    startTransition(async () => {
      try {
        await redefinirSenha(usuarioId, senha)
        setFeito('Senha alterada. Passe a nova senha para a pessoa — o sistema não avisa sozinho.')
        setSenha('')
        setSenhaAberta(false)
      } catch (e: unknown) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  const alternarAtivo = () => {
    setErro(null); setFeito(null)
    startTransition(async () => {
      try {
        const r = await alternarAtivoUsuario(usuarioId)
        setFeito(r.ativo ? 'Acesso reativado.' : 'Acesso inativado — a pessoa não entra mais até ser reativada.')
        router.refresh()
      } catch (e: unknown) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  const salvarEdicao = (formData: FormData) => {
    setErro(null); setFeito(null)
    const overrides: Record<string, boolean> = {}
    for (const c of capacidades) {
      const v = capLigada(c.chave, c.padraoAtual)
      if (v !== c.padraoAtual) overrides[c.chave] = v
    }
    formData.set('permissoes_usuario', JSON.stringify(overrides))
    startTransition(async () => {
      try {
        await editarUsuario(usuarioId, formData)
        setEditar(false)
        setFeito('Acesso atualizado.')
        router.refresh()
      } catch (e: unknown) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <div className="relative">
      <MenuAcoes disabled={isPending} rotulo={`Ações de ${usuarioNome}`}>
        {fechar => (
          <>
            <ItemMenu onClick={() => { fechar(); abrirEdicao() }}>
              <Pencil className="w-3.5 h-3.5" /> Editar usuário
            </ItemMenu>
            <ItemMenu onClick={() => { fechar(); setSenhaAberta(true); setFeito(null); setErro(null) }}>
              <KeyRound className="w-3.5 h-3.5" /> Redefinir senha
            </ItemMenu>
            <ItemMenu onClick={() => { fechar(); alternarAtivo() }}>
              <Power className="w-3.5 h-3.5" /> {usuarioAtivo ? 'Inativar usuário' : 'Ativar usuário'}
            </ItemMenu>
            {podeExcluir && (
              <ItemMenu tom="perigo" onClick={() => { fechar(); setConfirmOpen(true) }}>
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </ItemMenu>
            )}
          </>
        )}
      </MenuAcoes>

      {/* ─── Editar ────────────────────────────────────────────────────── */}
      {editar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !isPending && setEditar(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <form
            action={salvarEdicao}
            onClick={e => e.stopPropagation()}
            className="modal-pop-in relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-slate-800 font-semibold">Editar acesso — {usuarioNome}</p>
              <button type="button" onClick={() => setEditar(false)} aria-label="Fechar" className="btn-press w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Nome</label>
              <input name="nome" defaultValue={usuarioNome} required className="input" />
            </div>

            {usuarioRole !== 'admin' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">WhatsApp</label>
                <input name="telefone" defaultValue={usuarioTelefone ?? ''} placeholder="(11) 99999-9999" className="input" />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Status</label>
              <select name="ativo" defaultValue={usuarioAtivo ? 'true' : 'false'} className="input">
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </div>

            {!!capacidades.length && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Funções ligadas</label>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {capacidades.map(c => {
                    const on = capLigada(c.chave, c.padraoAtual)
                    return (
                      <label key={c.chave} className="flex items-start gap-3 p-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={e => setCaps(m => ({ ...m, [c.chave]: e.target.checked }))}
                          className="mt-0.5 h-4 w-4 accent-brand-500 shrink-0"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-slate-800">{c.nome}</span>
                          <span className="block text-2xs text-slate-500">{c.descricao}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {erro && <p className="text-red-500 text-xs">{erro}</p>}

            <button type="submit" disabled={isPending} className="btn btn-primario w-full">
              {isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </form>
        </div>
      )}

      {/* ─── Senha nova ────────────────────────────────────────────────── */}
      {senhaAberta && (
        <div className="modal-pop-in absolute right-0 top-full mt-1.5 w-72 z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-slate-800 text-sm font-medium truncate">Nova senha</p>
            <button onClick={() => { setSenhaAberta(false); setSenha(''); setErro(null) }} aria-label="Fechar" className="btn-press w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-slate-500 text-xs">Para {usuarioNome}. Mínimo 6 caracteres.</p>
          <input type="text" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Digite a nova senha" autoComplete="off" className="input" />
          <button onClick={trocarSenha} disabled={senha.length < 6 || isPending} className="btn btn-primario btn-sm w-full">
            {isPending ? 'Salvando…' : 'Trocar senha'}
          </button>
          <p className="text-slate-400 text-2xs">A senha aparece em texto para você conseguir copiar e enviar.</p>
        </div>
      )}

      {erro && !editar && (
        <div className="absolute right-0 top-full mt-1 w-64 z-30 bg-erro-50 border border-erro-200 text-erro-600 text-xs rounded-lg px-3 py-2 shadow-lg">
          <span className="flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />{erro}</span>
          <button onClick={() => setErro(null)} className="block mt-1 underline">fechar</button>
        </div>
      )}
      {feito && (
        <div className="absolute right-0 top-full mt-1 w-64 z-30 bg-sucesso-50 border border-sucesso-200 text-sucesso-700 text-xs rounded-lg px-3 py-2 shadow-lg">
          <span className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 shrink-0 mt-px" />{feito}</span>
          <button onClick={() => setFeito(null)} className="block mt-1 underline">fechar</button>
        </div>
      )}
      {isPending && !editar && !senhaAberta && (
        <div className="absolute right-0 top-full mt-1 z-30"><LogoLoading tamanho="sm" rotulo="Processando" /></div>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmarExclusao}
        isPending={isPending}
        mensagem={`Excluir usuário "${usuarioNome}"? Todos os eventos e dados vinculados a ele serão removidos.`}
      />
    </div>
  )
}
