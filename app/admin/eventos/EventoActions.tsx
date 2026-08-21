'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Power } from 'lucide-react'
import { toggleAtivoEvento, deletarEvento } from '@/lib/actions'
import ConfirmModal from '@/components/ConfirmModal'
import { MenuAcoes, ItemMenu } from '@/components/ui/MenuAcoes'

export default function EventoActions({ eventoId, ativo, podeExcluir = false }: { eventoId: string; ativo: boolean; podeExcluir?: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  /**
   * Executa e MOSTRA o que deu errado.
   *
   * Antes era `startTransition(() => deletarEvento(id))`, sem captura: quando a
   * action falhava, o erro morria ali e a tela não dizia nada — a pessoa
   * clicava, o modal fechava e o evento continuava na lista, sem explicação.
   *
   * `redirect()` do Next funciona lançando: por isso a exceção dele é
   * repassada em vez de virar mensagem de erro na tela.
   */
  const executar = (fn: () => Promise<unknown>) => {
    setErro(null)
    startTransition(async () => {
      try {
        await fn()
      } catch (e: unknown) {
        if (e && typeof e === 'object' && 'digest' in e && String((e as { digest?: string }).digest ?? '').startsWith('NEXT_REDIRECT')) {
          throw e
        }
        setConfirmOpen(false)
        setErro(e instanceof Error ? e.message : 'Não foi possível concluir. Tente de novo.')
      }
    })
  }

  return (
    <div className="relative">
      <MenuAcoes disabled={isPending} rotulo="Ações do evento">
        {fechar => (
          <>
            <ItemMenu onClick={() => { fechar(); router.push(`/admin/eventos/${eventoId}/editar`) }}>
              <Pencil className="w-3.5 h-3.5" /> Editar
            </ItemMenu>
            <ItemMenu onClick={() => { fechar(); executar(() => toggleAtivoEvento(eventoId, ativo)) }}>
              <Power className="w-3.5 h-3.5" />
              {ativo ? 'Encerrar' : 'Reativar'}
            </ItemMenu>
            {podeExcluir && (
              <ItemMenu tom="perigo" onClick={() => { fechar(); setConfirmOpen(true) }}>
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </ItemMenu>
            )}
          </>
        )}
      </MenuAcoes>

      {/* Alerta fora do menu: o menu fecha ao escolher, e o erro precisa
          sobreviver a esse fechamento pra ser lido. */}
      {erro && (
        <div className="absolute right-0 top-full mt-1 w-64 z-30 bg-erro-50 border border-erro-200 text-erro-600 text-xs rounded-lg px-3 py-2 shadow-lg">
          {erro}
          <button onClick={() => setErro(null)} className="block mt-1 underline">fechar</button>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => executar(() => deletarEvento(eventoId))}
        isPending={isPending}
        mensagem="Excluir o evento apaga setores, equipe e presenças, e não tem desfazer. Supervisores ligados aos setores perdem o vínculo, mas mantêm o acesso ao sistema."
      />
    </div>
  )
}
