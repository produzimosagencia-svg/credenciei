import { getPerfil, eventosEscaneaveis, meuSetor } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { podeEscanear, podeGerenciarEventos, podeAcompanhar } from '@/lib/permissions'
import ScannerView from './ScannerView'
import { QrCode, Users, ClipboardCheck } from 'lucide-react'
import Link from 'next/link'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import { ehMaster } from '@/lib/permissions'
import type { TutorialConfig } from '@/components/tutorial/types'

// Esta tela vai mudar quando o leitor for reformulado. O roteiro fica isolado
// aqui: pra atualizar depois, basta reescrever os passos e subir a `versao` —
// quem já tinha visto o tutorial antigo vê o novo automaticamente.
const TUTORIAL: TutorialConfig = {
  tela: 'scan',
  // Versão 2: o botão Entrada/Saída saiu (03/09/2026) — quem já tinha visto o
  // tutorial antigo, com o passo dele, vê o roteiro novo automaticamente.
  versao: 2,
  passos: [
    { alvo: 'scan-evento', titulo: 'Evento', posicao: 'bottom', icone: 'ListChecks',
      descricao: 'Confirme que é o evento certo antes de começar. Se você é supervisor, só aparece o evento do seu setor — não tem como escanear no evento errado.' },
    { alvo: 'scan-camera', titulo: 'A leitura', posicao: 'top', icone: 'ScanLine',
      descricao: 'Aponte para o QR Code na tela do celular da pessoa e aguarde: assim que reconhece, o nome dela aparece confirmado. Não tem botão de Entrada ou Saída pra escolher — o sistema decide sozinho, pelo que a pessoa já registrou hoje: primeira leitura é entrada, segunda é saída. Não precisa apertar nada — é contínuo, pode ir passando a fila.' },
    { alvo: 'scan-equipe', titulo: 'Sua equipe', posicao: 'bottom', icone: 'Users',
      descricao: 'Atalho para o painel do seu setor, onde você vê quem já registrou cada etapa e quem ainda está pendente. Vale abrir de tempos em tempos durante o evento.' },
  ],
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const [{ evento }, perfil] = await Promise.all([searchParams, getPerfil()])
  if (!perfil) redirect('/login')
  if (!podeEscanear(perfil.role)) redirect('/admin')

  // Eventos que ESTE usuário pode escanear:
  // master → todos ativos | admin → da própria org | supervisor → só o do próprio setor
  const [eventos, setor] = await Promise.all([eventosEscaneaveis(perfil), meuSetor(perfil)])

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil.role)}>
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="px-4 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">Credenciei</span>
        </div>
        <div className="flex items-center gap-3">
          <TutorialButton />
          {setor ? (
            <Link
              href={`/admin/eventos/${setor.evento_id}/fornecedor/${setor.id}`}
              data-tutorial="scan-equipe"
              className="flex items-center gap-1.5 text-slate-400 text-sm hover:text-white font-medium transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              Minha equipe: {setor.nome}
            </Link>
          ) : podeGerenciarEventos(perfil.role) ? (
            <Link href="/admin" className="text-slate-400 text-sm hover:text-white font-medium transition-colors">
              Voltar ao painel
            </Link>
          ) : podeAcompanhar(perfil.role) ? (
            // Sem setor e sem gerenciar evento: é o operador de portão — o
            // link dele é o registro manual, não "voltar ao painel" (que ele
            // não tem) nem "minha equipe" (que ele também não tem).
            <Link href="/admin/localizar" className="flex items-center gap-1.5 text-slate-400 text-sm hover:text-white font-medium transition-colors">
              <ClipboardCheck className="w-3.5 h-3.5" />
              Registrar ponto
            </Link>
          ) : null}
        </div>
      </div>
      {!eventos?.length ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <QrCode className="w-10 h-10 text-slate-700" />
          <p className="text-slate-400 font-medium">Nenhum evento ativo disponível</p>
        </div>
      ) : (
        <ScannerView eventos={eventos} initialEventoId={evento} />
      )}
    </div>
    </TutorialProvider>
  )
}
