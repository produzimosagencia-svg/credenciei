import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, Send, Workflow, MessagesSquare } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { PageHeader } from '@/components/ui/Superficie'
import AbasWhatsApp from './AbasWhatsApp'
import ExtrairCustoEventoModal from './ExtrairCustoEventoModal'

/**
 * Painel do canal de WhatsApp — exclusivo do MASTER.
 *
 * A checagem vive no layout, não em cada página: assim uma tela nova nascida
 * dentro desta pasta já entra protegida, em vez de depender de alguém lembrar
 * de copiar o `redirect`. É o tipo de esquecimento que só aparece quando já
 * vazou.
 */

export const ABAS = [
  { href: '/admin/whatsapp', label: 'Visão geral', icone: MessageCircle },
  { href: '/admin/whatsapp/disparo', label: 'Novo disparo', icone: Send },
  { href: '/admin/whatsapp/fluxos', label: 'Fluxos automáticos', icone: Workflow },
  { href: '/admin/whatsapp/conversas', label: 'Conversas', icone: MessagesSquare },
]

export default async function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!ehMaster(perfil.role)) redirect('/admin')

  // Pra "Extrair custo evento": a lista de eventos pro seletor do modal.
  // Vive no layout, e não só na Visão geral, porque o pedido foi "ali no
  // WhatsApp" — a mesma barra que já tem o link da Meta, em toda aba da seção.
  const { data: eventos } = await supabaseAdmin
    .from('eventos').select('id, nome').order('data_inicio', { ascending: false })

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="WhatsApp"
        descricao="O canal oficial da plataforma — disparos, fluxos e conversas"
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <ExtrairCustoEventoModal eventos={(eventos ?? []).map(e => ({ id: e.id as string, nome: e.nome as string }))} />
            <Link href="https://business.facebook.com/wa/manage/message-templates/" target="_blank"
              rel="noopener noreferrer" className="btn btn-secundario">
              Gerenciador da Meta
            </Link>
          </div>
        }
      />
      <AbasWhatsApp abas={ABAS.map(a => ({ href: a.href, label: a.label }))} />
      {children}
    </div>
  )
}
