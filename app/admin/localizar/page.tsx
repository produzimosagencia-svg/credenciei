import { redirect } from 'next/navigation'
import { UserSearch } from 'lucide-react'

import { getPerfil } from '@/lib/supabase-server'
import { podeEscanear, ehMaster } from '@/lib/permissions'
import LocalizarFuncionario from './LocalizarFuncionario'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

export const revalidate = 0

const TUTORIAL: TutorialConfig = {
  tela: 'localizar-funcionario',
  versao: 1,
  passos: [
    { alvo: 'loc-busca', titulo: 'Ache a pessoa', posicao: 'bottom', icone: 'Search',
      descricao: 'Quando alguém da sua equipe perder o horário de uma batida, você recebe o aviso no WhatsApp, encontra a pessoa e busca por ela aqui — pelo CPF, se tiver o documento em mãos, ou pelo nome. Se aparecer mais de uma pessoa, escolha na lista. Só aparecem pessoas dos setores sob sua responsabilidade.' },
    { alvo: 'loc-ficha', titulo: 'Confira quem é', posicao: 'bottom', icone: 'IdCard',
      descricao: 'Confirme pela foto e pelo nome que é a pessoa certa antes de seguir. O quadro colorido no fim mostra qual batida está faltando — é essa que vai ser registrada.' },
    { alvo: 'loc-foto', titulo: 'Tire a foto do rosto', posicao: 'bottom', icone: 'Camera',
      descricao: 'É a prova de que o colaborador estava na sua frente na hora do registro. Sem essa foto o sistema não deixa registrar, e ela fica guardada junto com a batida para sempre.' },
    { alvo: 'loc-registrar', titulo: 'Registrar', posicao: 'top', icone: 'ClipboardCheck',
      descricao: 'Você não escolhe qual batida gravar: o sistema grava sozinho a que está pendente. Junto ficam o seu nome, o horário, a localização e o aparelho — nada disso pode ser alterado depois.' },
  ],
}

export default async function LocalizarPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeEscanear(perfil.role)) redirect('/admin')

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil.role)}>
      {/*
        Centralizado de propósito: esta tela tem UMA tarefa (achar a pessoa e
        regularizar a batida) e é usada em pé, no meio do evento, muitas vezes
        no celular. Encostada à esquerda numa tela larga, o campo de busca —
        que é o começo de tudo — ficava num canto, longe do olhar.
      */}
      <div className="min-h-[70vh] flex flex-col items-center justify-center py-8">
        <div className="w-full max-w-md space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(59,130,246,0.18)' }}>
                <UserSearch className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-800 leading-tight">Localizar funcionário</h1>
                <p className="text-slate-500 text-sm">Regularize a batida de quem perdeu o horário</p>
              </div>
            </div>
            <TutorialButton />
          </div>

          <LocalizarFuncionario />
        </div>
      </div>
    </TutorialProvider>
  )
}
