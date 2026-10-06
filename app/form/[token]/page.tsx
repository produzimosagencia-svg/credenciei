import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import FormularioFuncionario from './FormularioFuncionario'
import { QrCode, Link2Off } from 'lucide-react'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'
import { consultarAutorizacaoCadastroIndividual } from '@/lib/cadastro-individual'
import { eventoUsaEscalaPorDia, diasDaEscalaDoEvento } from '@/lib/escala'
import { diaBRT } from '@/lib/janelas'
import type { DiaDaEscala } from '@/lib/escala-regras'

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
  searchParams: Promise<{ de?: string; cpf?: string; individual?: string }>
}) {
  const { token } = await params
  const { de, cpf, individual } = await searchParams
  const origem = de === 'portaria' ? 'portaria' : 'formulario'

  const { data: fornecedor } = await supabase
    .from('fornecedores')
    .select('*, eventos(id, nome, local, data_inicio, cadastro_suspenso, organizacao_id)')
    .eq('token_formulario', token)
    .single()

  if (!fornecedor) notFound()

  const evento = (fornecedor.eventos as any)

  /*
   * Biometria — consulta À PARTE e tolerante, mesmo padrão do resto do
   * sistema: esta página é a PORTA DE ENTRADA de toda a equipe, e pedir uma
   * coluna que ainda não existe no select principal derrubaria o cadastro
   * inteiro por causa de um recurso que a maioria dos eventos nem liga.
   */
  let biometriaHabilitada = false
  if (evento?.id) {
    try {
      const { data } = await supabase
        .from('eventos').select('metodo_identificacao').eq('id', evento.id).maybeSingle()
      biometriaHabilitada = data?.metodo_identificacao === 'biometria' || data?.metodo_identificacao === 'biometria_qr'
    } catch { /* biometria ainda não migrada */ }
  }

  /*
   * Escala por dia — só em evento de subeventos (ver lib/escala.ts). Dias que
   * já passaram não aparecem: ninguém se escala para ontem. Evento normal
   * fica com `null` e o formulário é exatamente o de sempre.
   */
  let diasEscala: DiaDaEscala[] | null = null
  if (evento?.id && await eventoUsaEscalaPorDia(evento.id)) {
    const hoje = diaBRT()
    diasEscala = (await diasDaEscalaDoEvento(evento.id)).filter(d => d.data >= hoje)
  }
  const autorizacao = individual
    ? await consultarAutorizacaoCadastroIndividual(individual)
    : null
  const excecaoIndividualValida = Boolean(
    autorizacao?.valido
    && autorizacao.eventoId === evento?.id
    && autorizacao.fornecedorId === fornecedor.id,
  )

  /*
   * Cadastro suspenso pela organização (botão "Suspender cadastro" na tela
   * do evento). O link continua o mesmo — só a resposta muda. Quem já se
   * cadastrou não passa por aqui: a credencial dele é outra página.
   */
  /*
   * Duas trancas, e qualquer uma basta: o evento inteiro suspenso
   * (`cadastro_suspenso`) ou só ESTE setor desligado (`link_ativo`, o
   * botão no card do setor). Ver upgrade-link-do-setor.sql.
   */
  if ((evento?.cadastro_suspenso || fornecedor.link_ativo === false) && !excecaoIndividualValida) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-amber-500/15 text-amber-500">
            <Link2Off className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Cadastro encerrado</h1>
          <p className="text-slate-600 text-sm font-medium mt-1">{evento?.nome}</p>
          <p className="text-slate-500 text-sm mt-4">
            {evento?.cadastro_suspenso
              ? <>A organização fechou a lista deste evento.</>
              : <>A lista de <strong className="text-slate-700">{fornecedor.nome}</strong> foi fechada.</>}
            {' '}Se você já se cadastrou, sua credencial continua valendo — use o link que recebeu no WhatsApp. Se ainda precisa entrar na equipe, fale com quem te contratou.
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
          {excecaoIndividualValida && (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-center">
              <p className="text-green-800 text-sm font-bold">Cadastro individual liberado</p>
              <p className="text-green-700 text-xs mt-0.5">Este link aceita cadastros neste fornecedor durante 48 horas a partir da criação.</p>
            </div>
          )}
          <FormularioFuncionario
            fornecedorId={fornecedor.id}
            origem={origem}
            cpfInicial={cpf}
            autorizacaoIndividual={excecaoIndividualValida ? individual : undefined}
            biometriaHabilitada={biometriaHabilitada}
            diasEscala={diasEscala}
          />
        </div>
      </div>
    </TutorialProvider>
  )
}
