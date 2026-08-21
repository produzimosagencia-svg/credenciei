'use client'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, KeyRound, Check, AlertCircle, X } from 'lucide-react'
import { deletarUsuario, redefinirSenha } from '@/lib/actions'
import ConfirmModal from '@/components/ConfirmModal'
import { MenuAcoes, ItemMenu } from '@/components/ui/MenuAcoes'

export default function UsuarioActions({
  usuarioId, usuarioNome, podeExcluir = false,
}: {
  usuarioId: string
  usuarioNome: string
  /** Excluir é só do master; redefinir senha vale pra quem gerencia usuários. */
  podeExcluir?: boolean
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [senhaAberta, setSenhaAberta] = useState(false)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const confirmarExclusao = () => {
    startTransition(async () => {
      try {
        await deletarUsuario(usuarioId)
        router.refresh()
        setConfirmOpen(false)
      } catch (e: unknown) {
        setConfirmOpen(false)
        setErro(e instanceof Error ? e.message : 'Não foi possível excluir.')
      }
    })
  }

  const trocarSenha = () => {
    setErro(null)
    setFeito(null)
    startTransition(async () => {
      try {
        await redefinirSenha(usuarioId, senha)
        setFeito('Senha alterada. Passe a nova senha para a pessoa — o sistema não avisa sozinho.')
        setSenha('')
        setSenhaAberta(false)
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível redefinir a senha.')
      }
    })
  }

  return (
    <div className="relative">
      <MenuAcoes disabled={isPending} rotulo={`Ações de ${usuarioNome}`}>
        {fechar => (
          <>
            <ItemMenu onClick={() => { fechar(); setSenhaAberta(true); setFeito(null); setErro(null) }}>
              <KeyRound className="w-3.5 h-3.5" /> Redefinir senha
            </ItemMenu>
            {podeExcluir && (
              <ItemMenu tom="perigo" onClick={() => { fechar(); setConfirmOpen(true) }}>
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </ItemMenu>
            )}
          </>
        )}
      </MenuAcoes>

      {/* Painel da senha nova. Fica fora do menu porque o menu fecha ao
          escolher, e o campo precisa sobreviver a esse fechamento. */}
      {senhaAberta && (
        <div className="modal-pop-in absolute right-0 top-full mt-1.5 w-72 z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-slate-800 text-sm font-medium truncate">Nova senha</p>
            <button
              onClick={() => { setSenhaAberta(false); setSenha(''); setErro(null) }}
              aria-label="Fechar"
              className="btn-press w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-slate-500 text-xs">Para {usuarioNome}. Mínimo 6 caracteres.</p>
          <input
            type="text"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            placeholder="Digite a nova senha"
            autoComplete="off"
            className="input"
          />
          <button
            onClick={trocarSenha}
            disabled={senha.length < 6 || isPending}
            className="btn btn-primario btn-sm w-full"
          >
            {isPending ? 'Salvando…' : 'Trocar senha'}
          </button>
          {/* Em texto aberto de propósito: quem redefine precisa LER pra
              repassar. Senha mascarada aqui só geraria erro de digitação. */}
          <p className="text-slate-400 text-2xs">
            A senha aparece em texto para você conseguir copiar e enviar.
          </p>
        </div>
      )}

      {erro && (
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
