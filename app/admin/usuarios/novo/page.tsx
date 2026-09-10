import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/Superficie'
import { podeGerenciarUsuarios, ehMaster, veTodosEventos } from '@/lib/permissions'
import NovoAcessoForm from './NovoUsuarioForm'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

export const revalidate = 0

const TUTORIAL: TutorialConfig = {
  tela: 'usuarios-novo',
  versao: 2,
  passos: [
    { alvo: 'novo-acesso-funcao', titulo: 'A função', posicao: 'bottom', icone: 'ShieldCheck',
      descricao: 'Escolha o que a pessoa é no sistema. Cada função pede um vínculo diferente: supervisor vai a um setor, gestor de credenciamento e suporte vão a um evento, admin vai a uma organização.' },
    { alvo: 'novo-acesso-escopo', titulo: 'O vínculo', posicao: 'bottom', icone: 'Building2',
      descricao: 'É o que a pessoa vai enxergar. O supervisor fica preso a um único setor; se ela cuida de dois, crie dois acessos.' },
    { alvo: 'novo-acesso-funcoes', titulo: 'Funções ligadas', posicao: 'top', icone: 'ShieldCheck',
      descricao: 'Cada função já vem com o conjunto padrão do papel. Aqui você desliga o que essa pessoa específica não deve ter — ou liga um extra.' },
    { alvo: 'novo-acesso-status', titulo: 'Status', posicao: 'top', icone: 'ShieldCheck',
      descricao: 'Ativo entra já. Inativo cria o acesso bloqueado — útil pra deixar pronto antes do evento e liberar só no dia.' },
  ],
}

export default async function NovoAcessoPage() {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil)) redirect('/admin')

  const master = ehMaster(perfil?.role)
  const veTudo = veTodosEventos(perfil)

  // Eventos ativos com os setores de cada um. Supervisor precisa do setor;
  // gestor de credenciamento e suporte, só do evento.
  const eventosQuery = supabaseAdmin
    .from('eventos')
    .select('id, nome, organizacao_id, fornecedores(id, nome)')
    .eq('ativo', true)
    .order('data_inicio', { ascending: false })
  if (!veTudo) eventosQuery.eq('organizacao_id', perfil!.organizacao_id)

  // Organizações — só o master escolhe (pra opção "Admin"); o admin sempre
  // adiciona à própria.
  const orgsQuery = master
    ? supabaseAdmin.from('organizacoes').select('id, nome').eq('ativo', true).order('nome')
    : Promise.resolve({ data: [] as { id: string; nome: string }[] })

  const [{ data: eventos }, { data: organizacoes }] = await Promise.all([eventosQuery, orgsQuery])

  return (
    <TutorialProvider tutorial={TUTORIAL}>
      <div className="max-w-lg mx-auto space-y-6">
        <PageHeader
          voltarPara="/admin/usuarios"
          titulo="Novo acesso"
          descricao="Escolha a função, o vínculo e o que a pessoa pode fazer"
          acoes={<TutorialButton />}
        />

        <NovoAcessoForm
          eventos={(eventos ?? []) as EventoOpt[]}
          organizacoes={(organizacoes ?? []) as { id: string; nome: string }[]}
          ehMaster={master}
        />
      </div>
    </TutorialProvider>
  )
}

type EventoOpt = { id: string; nome: string; organizacao_id: string | null; fornecedores: { id: string; nome: string }[] }
