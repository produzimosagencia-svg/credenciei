'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Power, Eye, Trash2 } from 'lucide-react'
import { MenuAcoes, ItemMenu } from '@/components/ui/MenuAcoes'
import ConfirmModal from '@/components/ConfirmModal'
import { alternarAtivoAviso, excluirAviso } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'
import AvisoFormModal from './AvisoFormModal'
import VisualizacoesAvisoModal from './VisualizacoesAvisoModal'
import type { LinhaAviso } from './TabelaAvisos'

type FuncionarioDoEvento = { id: string; nome: string; cpf: string }
type Fornecedor = { id: string; nome: string }

/** Editar / Ativar-Desativar / Ver quem visualizou / Excluir, num só menu "…". */
export default function AcoesAviso({
  aviso, eventoId, fornecedores, funcionarios,
}: {
  aviso: LinhaAviso
  eventoId: string
  fornecedores: Fornecedor[]
  funcionarios: FuncionarioDoEvento[]
}) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [verVisualizacoes, setVerVisualizacoes] = useState(false)
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false)
  const router = useRouter()

  const toggleAtivo = () => {
    setErro(null)
    startTransition(async () => {
      try {
        await alternarAtivoAviso(aviso.id, eventoId, !aviso.ativo)
        router.refresh()
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  const confirmarExclusao = () => {
    setConfirmandoExcluir(false)
    setErro(null)
    startTransition(async () => {
      try {
        await excluirAviso(aviso.id, eventoId)
        router.refresh()
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <>
      <MenuAcoes disabled={isPending} rotulo={`Ações do aviso ${aviso.titulo}`}>
        {fechar => (
          <>
            <AvisoFormModal
              mode="editar" eventoId={eventoId} aviso={aviso} fornecedores={fornecedores} funcionarios={funcionarios}
              renderTrigger={abrir => (
                <ItemMenu onClick={() => { abrir(); fechar() }}>
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </ItemMenu>
              )}
            />
            <ItemMenu onClick={() => { toggleAtivo(); fechar() }}>
              <Power className="w-3.5 h-3.5" /> {aviso.ativo ? 'Desativar' : 'Ativar'}
            </ItemMenu>
            <ItemMenu onClick={() => { setVerVisualizacoes(true); fechar() }}>
              <Eye className="w-3.5 h-3.5" /> Ver quem visualizou
            </ItemMenu>
            <ItemMenu tom="perigo" onClick={() => { setConfirmandoExcluir(true); fechar() }}>
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </ItemMenu>
          </>
        )}
      </MenuAcoes>

      {erro && <p className="text-red-500 text-2xs mt-1 max-w-[10rem] text-right ml-auto">{erro}</p>}

      <VisualizacoesAvisoModal avisoId={aviso.id} eventoId={eventoId} titulo={aviso.titulo} open={verVisualizacoes} onClose={() => setVerVisualizacoes(false)} />

      <ConfirmModal
        open={confirmandoExcluir}
        onClose={() => setConfirmandoExcluir(false)}
        onConfirm={confirmarExclusao}
        isPending={isPending}
        zIndexClassName="z-[65]"
        mensagem={`Excluir o aviso "${aviso.titulo}"? Quem ainda não viu não vai mais ver.`}
      />
    </>
  )
}
