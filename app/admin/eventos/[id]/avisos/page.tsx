import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import { PageHeader } from '@/components/ui/Superficie'
import PainelDeAvisos, { eventoVisivel } from './PainelDeAvisos'

export const revalidate = 0

/**
 * Avisos deste evento — o mural de comunicados que o admin manda pro
 * funcionário (credencial pública) e/ou pro supervisor (painel do setor).
 *
 * Alcançada por dois caminhos: daqui (de dentro do evento) e pelo item
 * "Avisos" do menu, que pergunta o evento antes (`/admin/avisos`). As duas
 * rotas renderizam o MESMO `PainelDeAvisos` — o que muda é só o cabeçalho e
 * como cada uma decide qual evento você pode abrir.
 *
 * Ver `lib/avisos.ts` para quem recebe o quê, e
 * `supabase/upgrade-avisos.sql` para o desenho da tabela.
 */
export default async function AvisosDoEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil)) redirect('/admin')

  const { id: eventoId } = await params
  const evento = await eventoVisivel(eventoId, perfil, veTodosEventos(perfil))

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Avisos"
        descricao={`${evento.nome} — comunicados na credencial e no painel do supervisor`}
        acoes={
          <Link href={`/admin/eventos/${eventoId}`} className="btn btn-secundario">
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" /> Voltar ao evento
          </Link>
        }
      />
      <PainelDeAvisos eventoId={eventoId} />
    </div>
  )
}
