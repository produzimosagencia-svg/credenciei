'use client'
import { useState } from 'react'
import {
  Download, AlertTriangle, UserCheck, Clock, UserPlus, MapPin, ShieldAlert, Building2, Truck, Layers, ShieldBan,
  ClipboardList, FolderOpen,
} from 'lucide-react'
import { LogoLoading } from '@/components/LogoLoading'
import { Secao } from '@/components/ui/Superficie'
import { obterRelatorioExtra, type TipoRelatorioExtra } from '@/lib/relatorios-extras'
import { obterRelatorioForaDoLocal, obterRelatorioTravas } from '@/lib/actions'
import { baixarPlanilhaPadrao } from '@/lib/planilha-padrao'
import { baixarPlanilhaForaDoLocal } from '@/lib/relatorio-fora-local-excel'
import { gerarPlanilhaTravas } from '@/lib/relatorio-travas-excel'

type Chave = TipoRelatorioExtra | 'fora_local' | 'limites'

const RELATORIOS: { chave: Chave; titulo: string; descricao: string; Icone: React.ElementType; soGestor: boolean }[] = [
  { chave: 'hoje', titulo: 'Credenciados hoje', descricao: 'Quem entrou hoje: entrada, meio, saída e quem registrou.', Icone: UserCheck, soGestor: false },
  { chave: 'aguardando', titulo: 'Aguardando aprovação', descricao: 'Cadastros que ainda esperam o supervisor ou o admin decidir.', Icone: Clock, soGestor: false },
  { chave: 'cadastros', titulo: 'Cadastros recebidos', descricao: 'Todo mundo que pediu para se cadastrar, com a situação de cada um.', Icone: UserPlus, soGestor: false },
  { chave: 'fora_local', titulo: 'Fora do local', descricao: 'Batidas e tentativas fora do raio do evento, com endereço.', Icone: MapPin, soGestor: false },
  { chave: 'limites', titulo: 'Limite por dia', descricao: 'Limite de pessoas de cada setor em cada dia, e quantos estão aprovados.', Icone: ShieldAlert, soGestor: true },
  { chave: 'pedidos_setor', titulo: 'Pedidos de setor', descricao: 'Pedidos de setor e de mais colaboradores, com a decisão.', Icone: Building2, soGestor: true },
  { chave: 'veiculos', titulo: 'Veículos', descricao: 'Veículos cadastrados, condutor e situação.', Icone: Truck, soGestor: true },
  { chave: 'subeventos', titulo: 'Subeventos', descricao: 'Resumo por subevento e por fornecedor: cadastrados, aprovados, entraram hoje.', Icone: Layers, soGestor: true },
  { chave: 'bloqueios', titulo: 'CPFs bloqueados', descricao: 'CPFs barrados no evento, motivo e quem bloqueou.', Icone: ShieldBan, soGestor: true },
  { chave: 'auditoria', titulo: 'Auditoria do evento', descricao: 'Tudo que foi alterado no evento: quem, o quê e quando.', Icone: ClipboardList, soGestor: true },
]

/**
 * Os relatórios do evento além do de entrada/saída — pedido do Juan, 09/10/2026: "tudo que tenha de relatório no
 * sistema esteja dentro desse campo". Busca os dados e monta o .xlsx só no clique. O supervisor vê só os
 * relatórios que têm recorte por setor (e o servidor só manda as linhas dos setores dele).
 */
export default function OutrosRelatorios({ eventoId, eventoInteiro }: { eventoId: string; eventoInteiro: boolean }) {
  const [gerando, setGerando] = useState<Chave | null>(null)
  const [erro, setErro] = useState<{ chave: Chave; texto: string } | null>(null)

  const baixar = async (chave: Chave) => {
    setErro(null)
    setGerando(chave)
    try {
      if (chave === 'fora_local') {
        const r = await obterRelatorioForaDoLocal(eventoId)
        if (!r.ok) throw new Error(r.error)
        await baixarPlanilhaForaDoLocal(r.relatorio.linhas, r.eventoNome, r.relatorio.raioM, r.eventoInteiro ? 'todo o evento' : 'meus setores')
      } else if (chave === 'limites') {
        const r = await obterRelatorioTravas(eventoId)
        if (!r.ok) throw new Error(r.error)
        await gerarPlanilhaTravas(r.relatorio, r.eventoNome)
      } else {
        const r = await obterRelatorioExtra(eventoId, chave)
        if ('erro' in r) throw new Error(r.erro)
        await baixarPlanilhaPadrao(r.relatorio)
      }
    } catch (e) {
      setErro({ chave, texto: e instanceof Error && e.message ? e.message : 'Não foi possível gerar a planilha.' })
    } finally {
      setGerando(null)
    }
  }

  const visiveis = RELATORIOS.filter(r => eventoInteiro || !r.soGestor)

  return (
    <Secao
      icone={<FolderOpen className="w-3.5 h-3.5" />}
      titulo="Outros relatórios do evento"
      descricao="Cada um baixa uma planilha (.xlsx) com os dados de agora"
      corpoClassName="p-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {visiveis.map(({ chave, titulo, descricao, Icone }) => (
          <div key={chave} className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <Icone className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-slate-800 font-semibold text-sm">{titulo}</p>
                <p className="text-slate-500 text-xs mt-0.5 leading-snug">{descricao}</p>
              </div>
            </div>
            {erro?.chave === chave && (
              <p className="flex items-start gap-1.5 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro.texto}
              </p>
            )}
            <button
              type="button" onClick={() => baixar(chave)} disabled={gerando !== null}
              className="btn btn-secundario btn-sm w-full mt-auto disabled:opacity-60"
            >
              {gerando === chave
                ? <><LogoLoading tamanho="xs" /> Gerando...</>
                : <><Download className="w-3.5 h-3.5" /> Baixar planilha</>}
            </button>
          </div>
        ))}
      </div>
    </Secao>
  )
}
