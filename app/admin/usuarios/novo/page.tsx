import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, Building2, MessageCircle, KeyRound, ShieldCheck } from 'lucide-react'
import { podeGerenciarUsuarios, ehMaster } from '@/lib/permissions'
import NovoUsuarioForm from './NovoUsuarioForm'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

const TUTORIAL: TutorialConfig = {
  tela: 'usuarios-novo',
  versao: 1,
  passos: [
    { alvo: 'novo-usr-evento', titulo: 'Evento', posicao: 'bottom', icone: CalendarDays,
      descricao: 'Escolha em qual evento esse supervisor vai trabalhar. Só aparecem eventos ativos da sua organização.' },
    { alvo: 'novo-usr-setor', titulo: 'Setor — a decisão mais importante', posicao: 'bottom', icone: Building2,
      descricao: 'O supervisor fica preso a um único setor: ele enxerga apenas a equipe desse setor e só consegue escanear essas pessoas. Se a pessoa precisa cuidar de dois setores, crie dois acessos.' },
    { alvo: 'novo-usr-telefone', titulo: 'Telefone', posicao: 'bottom', icone: MessageCircle,
      descricao: 'É por aqui que ele recebe, no WhatsApp, o próprio login e o link de cadastro pra mandar no grupo da equipe. Também é onde chegam os alertas de quem está com presença pendente.' },
    { alvo: 'novo-usr-senha', titulo: 'Senha', posicao: 'bottom', icone: KeyRound,
      descricao: 'Você define a senha inicial, com no mínimo 6 caracteres. Ela é enviada junto com o login no WhatsApp — anote se precisar repassar por outro canal.' },
    { alvo: 'novo-usr-status', titulo: 'Status', posicao: 'top', icone: ShieldCheck,
      descricao: 'Deixe Ativo pra ele entrar já. Inativo cria o acesso bloqueado — útil pra deixar tudo pronto antes do evento e liberar só no dia.' },
  ],
}

export default async function NovoUsuarioPage() {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) redirect('/admin')
  // Master não cria equipe aqui — cria admins/organizações
  if (ehMaster(perfil?.role)) redirect('/admin/organizacoes/novo')

  // Eventos ativos da própria organização, com os setores (fornecedores) de cada um —
  // todo supervisor tem que ser criado vinculado a um setor específico.
  const { data: eventos } = await supabaseAdmin
    .from('eventos')
    .select('id, nome, fornecedores(id, nome)')
    .eq('ativo', true)
    .eq('organizacao_id', perfil!.organizacao_id)
    .order('data_inicio', { ascending: false })

  return (
    <TutorialProvider tutorial={TUTORIAL}>
      <div className="max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/usuarios" className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 transition-all shadow-sm">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-800">Novo Usuário</h1>
            <p className="text-slate-400 text-sm">Crie o acesso e defina o papel no sistema</p>
          </div>
          <TutorialButton />
        </div>

        <NovoUsuarioForm eventos={eventos ?? []} />
      </div>
    </TutorialProvider>
  )
}
