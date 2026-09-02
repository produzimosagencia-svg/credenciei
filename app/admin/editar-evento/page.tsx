import { redirect } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import { PageHeader } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'

export const revalidate = 0

/**
 * "Editar evento" pelo menu — o passo de escolher qual.
 *
 * Existe porque o cabeçalho da tela do evento perdeu os botões de ação: tudo
 * passou pro menu, e o menu não sabe de qual evento se trata. Aqui a pessoa
 * escolhe e cai direto no formulário de sempre
 * (`/admin/eventos/[id]/editar`) — esta tela não duplica o formulário, só
 * aponta pra ele.
 *
 * Master vê todos os eventos; admin só os da própria organização. A régua
 * está em `eventosQuePossoAbrir`, e a tela de edição refaz a checagem por
 * conta própria — a lista só esconde, quem barra é ela.
 */
export default async function EditarEventoPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil.role)) redirect('/admin')

  return (
    <div className="space-y-5">
      <PageHeader titulo="Editar evento" descricao="Escolha o evento que quer ajustar" />
      <EscolherEvento
        eventos={await eventosQuePossoAbrir()}
        href={id => `/admin/eventos/${id}/editar`}
        icone={<Pencil className="w-3.5 h-3.5" />}
        titulo="Qual evento?"
        descricao="Datas, local, horários do dia principal, dias de trabalho e a batida do meio"
        vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para poder editá-lo aqui.' }}
        mostrarOrganizacao={veTodosEventos(perfil.role)}
      />
    </div>
  )
}
