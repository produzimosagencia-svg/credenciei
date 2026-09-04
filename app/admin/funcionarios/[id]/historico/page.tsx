import { redirect, notFound } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarEventos } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { formatCpf } from '@/lib/format'
import { historicoDoFuncionario, podeVerHistoricoDe } from '@/lib/historico'
import { PageHeader, Badge } from '@/components/ui/Superficie'
import HistoricoBatidas from '@/components/HistoricoBatidas'

export const revalidate = 0

/**
 * O histórico de uma pessoa num evento, dia a dia — em página cheia.
 *
 * Existe para quem chega aqui por link direto (hoje, só as Conversas de
 * WhatsApp mandam pra cá). Dentro da tela do setor, o mesmo conteúdo mora
 * numa aba do modal do funcionário — ver `FuncionarioDetalheModal.tsx` — que
 * abre sem navegar, o caminho normal quando se está conferindo a equipe.
 *
 * As duas telas renderizam o mesmo `HistoricoBatidas`: "não realizada" aqui
 * não é um dado gravado, é a diferença entre o dia que o evento esperava e a
 * batida que não existe (ver lib/historico.ts).
 */
export default async function HistoricoPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const { id } = await params
  if (!(await podeVerHistoricoDe(perfil, id))) redirect('/admin')

  const h = await historicoDoFuncionario(id)
  if (!h) notFound()

  return (
    <div className="space-y-5">
      <PageHeader
        titulo={h.nome}
        descricao={`${formatCpf(h.cpf)} · ${h.eventoNome} · ${h.setorNome}`}
        voltarPara={`/admin/eventos/${h.eventoId}/fornecedor/${h.fornecedorId}`}
        acoes={
          h.descredenciadoEm
            ? <Badge tom="neutro">Descredenciado em {formatarBR(h.descredenciadoEm, 'curto')}</Badge>
            : <Badge tom="positivo">Credenciado</Badge>
        }
      />
      {/*
        * `podeEditar`/`role` são a MESMA régua que as actions aplicam no
        * servidor (`lancarPontoManual` e `apagarBatida`) — aqui só decidem
        * se o controle aparece. Sem eles, esta página mostrava o histórico
        * sem nenhuma forma de corrigir, enquanto o modal do setor mostrava
        * as duas — a mesma pessoa via coisas diferentes dependendo do
        * caminho que usou pra chegar.
        */}
      <HistoricoBatidas
        h={h}
        podeEditar={podeGerenciarEventos(perfil) || perfil.role === 'supervisor' || perfil.role === 'suporte'}
        role={perfil.role}
      />
    </div>
  )
}
