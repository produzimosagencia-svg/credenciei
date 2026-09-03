import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import FormularioFuncionario from './FormularioFuncionario'
import { QrCode, Link2Off } from 'lucide-react'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

const TUTORIAL: TutorialConfig = {
  tela: 'funcionario-cadastro',
  versao: 1,
  passos: [
    { alvo: 'form-titulo', titulo: 'Bem-vindo!', posicao: 'bottom',
      descricao: 'Este cadastro é o seu credenciamento no evento. Leva menos de dois minutos e, no fim, você recebe sua credencial com QR Code. É rápido — vamos passar campo por campo.' },
    { alvo: 'form-foto', titulo: 'Sua foto', posicao: 'bottom',
      descricao: 'É opcional, mas ajuda o credenciamento a te identificar na hora da entrada. Ao tocar em "Tirar foto", seu celular abre a câmera frontal.' },
    { alvo: 'form-cpf', titulo: 'CPF', posicao: 'bottom',
      descricao: 'Se você já trabalhou em outro evento desta organização, ao digitar o CPF o resto do formulário se preenche sozinho. Só confira se os dados continuam certos.' },
    { alvo: 'form-telefone', titulo: 'Telefone — atenção aqui', posicao: 'bottom',
      descricao: 'É neste número que você vai receber tudo pelo WhatsApp: o link da sua credencial, o aviso no dia do evento e os lembretes na hora de bater cada ponto. Confira se está certo e com DDD.' },
    { alvo: 'form-pix', titulo: 'Chave PIX', posicao: 'top',
      descricao: 'Opcional. Serve para o pagamento do seu trabalho no evento, se for combinado assim com quem te contratou.' },
    { alvo: 'form-enviar', titulo: 'Pronto para enviar', posicao: 'top',
      descricao: 'Ao enviar, o sistema gera sua credencial com QR Code. Guarde o link que aparecer — é ele que você vai usar durante todo o evento.' },
  ],
}

export default async function FormPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>
  /*
   * `?de=portaria` diz que a pessoa veio do cartaz da entrada, e não do link
   * que o supervisor mandou. O formulário é o mesmo — só a origem muda, e ela
   * importa no fechamento: saber que alguém entrou pelo cartaz, e não pela
   * lista, muda a conversa sobre quem autorizou aquela contratação.
   */
  searchParams: Promise<{ de?: string; cpf?: string }>
}) {
  const { token } = await params
  const { de, cpf } = await searchParams
  const origem = de === 'portaria' ? 'portaria' : 'formulario'

  const { data: fornecedor } = await supabase
    .from('fornecedores')
    .select('*, eventos(id, nome, local, data_inicio, cadastro_suspenso)')
    .eq('token_formulario', token)
    .single()

  if (!fornecedor) notFound()

  const evento = (fornecedor.eventos as any)

  /*
   * Cadastro suspenso pela organização (botão "Suspender cadastro" na tela
   * do evento). O link continua o mesmo — só a resposta muda. Quem já se
   * cadastrou não passa por aqui: a credencial dele é outra página.
   */
  if (evento?.cadastro_suspenso) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-amber-500/15 text-amber-500">
            <Link2Off className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Cadastro encerrado</h1>
          <p className="text-slate-600 text-sm font-medium mt-1">{evento?.nome}</p>
          <p className="text-slate-500 text-sm mt-4">
            A organização fechou a lista de <strong className="text-slate-700">{fornecedor.nome}</strong>. Se você já se cadastrou, sua credencial continua valendo — use o link que recebeu no WhatsApp. Se ainda precisa entrar na equipe, fale com quem te contratou.
          </p>
        </div>
      </div>
    )
  }

  return (
    <TutorialProvider tutorial={TUTORIAL} usuarioId={token}>
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8" data-tutorial="form-titulo">
            <div className="logo-marca inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg">
              <QrCode className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Credenciamento</h1>
            <p className="text-slate-600 text-sm font-medium mt-1">{evento?.nome}</p>
            <p className="text-slate-400 text-xs mt-0.5">Empresa: {fornecedor.nome}</p>
            <div className="flex justify-center mt-4">
              <TutorialButton />
            </div>
          </div>
          <FormularioFuncionario fornecedorId={fornecedor.id} origem={origem} cpfInicial={cpf} />
        </div>
      </div>
    </TutorialProvider>
  )
}
