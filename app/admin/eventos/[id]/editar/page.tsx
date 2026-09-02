import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { notFound, redirect } from 'next/navigation'
import { editarEvento, diasDoEvento, obterConfiguracaoDoMeio } from '@/lib/actions'
import { isoParaInput } from '@/lib/tz'
import { diaBRT } from '@/lib/janelas'
import DiasDeTrabalho from './DiasDeTrabalho'
import ConfiguracaoDoMeio from './ConfiguracaoDoMeio'
import ConferenciaDeHorarios from '../../ConferenciaDeHorarios'
import { NomeInput } from '@/components/inputs'
import DateTimePicker from '@/components/DateTimePicker'
import { FormLoadingOverlay } from '@/components/LoadingOverlay'
import { CalendarDays, CalendarRange, MapPin, LogIn, LogOut, Save } from 'lucide-react'
import { PageHeader } from '@/components/ui/Superficie'
import { getPerfil } from '@/lib/supabase-server'
import { ehMaster, veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

const TUTORIAL: TutorialConfig = {
  tela: 'evento-editar',
  versao: 1,
  passos: [
    { alvo: 'edt-geral', titulo: 'Informações gerais', posicao: 'right', icone: 'MapPin',
      descricao: 'Nome, descrição e local. Mudar o nome aqui muda em todo lugar: na lista, na credencial da equipe e nas mensagens de WhatsApp que ainda não foram enviadas.' },
    { alvo: 'edt-duracao', titulo: 'Duração do evento', posicao: 'right', icone: 'CalendarDays',
      descricao: 'Quando o evento começa e termina. Este período delimita tudo: fora dele ninguém bate ponto. Dentro dele, entrada e saída são livres em qualquer dia.' },
    { alvo: 'edt-janelas', titulo: 'Horários do dia principal', posicao: 'right', icone: 'LogIn',
      descricao: 'Quando a equipe pode bater entrada e saída no dia do evento. Mudar um horário aqui reagenda os lembretes de WhatsApp da equipe inteira, inclusive de quem já foi avisado.' },
    { alvo: 'edt-janelas', titulo: 'E o meio?', posicao: 'right', icone: 'Camera',
      descricao: 'Não tem horário para configurar. O sistema pede a batida por foto 4 horas depois da entrada de CADA pessoa — quem entra às 08:00 registra às 12:00, quem entra às 10:30 registra às 14:30. É pedido uma vez só. A equipe não entra junta, então um horário fixo cobraria a selfie de quem acabou de chegar.' },
    { alvo: 'edt-dias', titulo: 'Dias de montagem e desmontagem', posicao: 'top', icone: 'CalendarDays',
      descricao: 'O evento não acontece só no dia do evento. Marque aqui os dias em que a equipe trabalha na preparação: neles a entrada e a saída são livres, e o meio é contado 4 horas depois da entrada de cada pessoa. Dia não marcado não é dia de trabalho — ninguém bate ponto nele.' },
    { alvo: 'edt-salvar', titulo: 'Salvar', posicao: 'top', icone: 'Save',
      descricao: 'Ao salvar, as mudanças valem na hora para toda a equipe — inclusive para quem já está com a credencial aberta no celular.' },
  ],
}

export default async function EditarEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [perfil, { data: evento }] = await Promise.all([
    getPerfil(),
    supabase.from('eventos').select('*').eq('id', id).single(),
  ])
  if (!evento) notFound()

  /*
   * Isolamento por organização. A action `editarEvento` já barrava a ESCRITA,
   * mas a leitura estava aberta: com o UUID de um evento de outro cliente, um
   * admin abria esta tela e via datas, local, janelas e o id da planilha do
   * Google. `notFound` em vez de "sem permissão" pra não confirmar que o
   * evento existe.
   */
  if (!perfil || !podeGerenciarEventos(perfil.role)) redirect('/admin')
  if (!veTodosEventos(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  const action = editarEvento.bind(null, id)
  const fmt = (d: string | null | undefined) => isoParaInput(d)

  /*
   * Só ENTRADA e SAÍDA têm horário.
   *
   * O meio não tem, e não é omissão: ele é sempre a entrada real de cada
   * pessoa + 4h. No estádio a equipe não entra junta, e um horário fixo
   * cobraria a selfie de quem chegou às 15:00 no mesmo instante em que cobra
   * de quem chegou às 11:00. A caixa azul abaixo explica isso na tela.
   */
  const janelas = [
    { key: 'entrada', label: 'Entrada', icon: LogIn, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
    { key: 'fim', label: 'Saída', icon: LogOut, color: 'text-brand-600', bg: 'bg-brand-50', border: 'border-brand-100' },
  ] as const

  const [dias, configMeio] = await Promise.all([diasDoEvento(id), obterConfiguracaoDoMeio(id)])
  const diaPrincipal = evento.data_inicio ? diaBRT(evento.data_inicio as string) : ''

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil?.role)}>
    <div className="space-y-6">
      <PageHeader
        voltarPara={`/admin/eventos/${id}`}
        titulo="Editar evento"
        descricao={evento.nome}
        acoes={<TutorialButton />}
      />

      <form action={action} className="bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/60 overflow-hidden">
        {/* Informações gerais */}
        <div className="p-6 sm:p-8 space-y-5" data-tutorial="edt-geral">
          <SectionTitle title="Informações gerais" subtitle="Nome, descrição e local do evento" />
          <Field label="Nome do evento *">
            <NomeInput name="nome" required defaultValue={evento.nome} className="input" />
          </Field>
          <Field label="Descrição">
            <textarea name="descricao" rows={2} defaultValue={evento.descricao ?? ''} className="input resize-none" />
          </Field>
          <Field label="Local" icon={MapPin}>
            <NomeInput name="local" defaultValue={evento.local ?? ''} className="input" />
          </Field>
        </div>

        {/* Datas do evento */}
        <div className="p-6 sm:p-8 pt-0 space-y-4" data-tutorial="edt-duracao">
          <SectionTitle title="Duração" subtitle="Quando o evento começa e termina" icon={CalendarDays} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Data de início *">
              <DateTimePicker name="data_inicio" required defaultValue={fmt(evento.data_inicio)} />
            </Field>
            <Field label="Data de fim *">
              <DateTimePicker name="data_fim" required defaultValue={fmt(evento.data_fim)} />
            </Field>
          </div>
        </div>

        {/* Janelas de presença */}
        <div className="bg-slate-50 border-t border-slate-100 p-6 sm:p-8 space-y-4" data-tutorial="edt-janelas">
          <SectionTitle
            title="Horários do dia principal"
            subtitle="Quando a equipe pode bater entrada e saída no dia do evento"
          />

          {/*
            * Batida livre — o interruptor vem ANTES dos horários.
            *
            * Ele muda o significado de tudo que vem abaixo: com ele ligado, os
            * campos deixam de ser trava e viram referência. Colocá-lo depois
            * faria o produtor preencher os horários acreditando que eles vão
            * recusar alguém, e só então descobrir que não.
            */}
          <label
            htmlFor="batida_livre"
            className="block bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer
                       hover:border-brand-300 transition-colors"
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="batida_livre"
                name="batida_livre"
                defaultChecked={evento.batida_livre === true}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-brand-500 focus:ring-brand-400 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-slate-800 font-semibold text-sm">Batida livre no dia do evento</p>
                <p className="text-slate-600 text-xs mt-1">
                  A equipe bate quando chega e quando sai, sem horário fixo — do mesmo jeito
                  que já funciona nos dias de montagem.
                </p>
                <p className="text-slate-500 text-xs mt-1.5">
                  Use quando a operação for por <strong>escala rotativa</strong>: em show grande a
                  equipe entra a noite toda, em turnos, e uma janela fixa recusaria quem chega
                  às três da manhã.
                </p>
                <p className="text-slate-400 text-2xs mt-1.5">
                  Os horários abaixo continuam gravados e valendo como referência: são eles que
                  a equipe recebe na mensagem do dia, e é por eles que o sistema calcula quem
                  está atrasado. O que sai é só a recusa no portão.
                </p>
              </div>
            </div>
          </label>

          {/*
            * Auto-atendimento no dia principal — os dois fluxos coexistem.
            *
            * Desligado (padrão): o dia principal continua só no Fluxo 1,
            * crachá lido por um operador — nada muda pra quem já usa assim.
            * Ligado: o QR fixo da portaria (identificação por CPF) TAMBÉM
            * libera entrada e saída, sem tirar o operador de cena — os dois
            * caminhos ficam disponíveis ao mesmo tempo. Independe de "batida
            * livre": o horário continua sendo o de cima, só muda quem pode
            * fazer o registro.
            */}
          <label
            htmlFor="checkin_autonomo"
            className="block bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer
                       hover:border-brand-300 transition-colors"
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="checkin_autonomo"
                name="checkin_autonomo"
                defaultChecked={evento.checkin_autonomo === true}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-brand-500 focus:ring-brand-400 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-slate-800 font-semibold text-sm">Auto-atendimento no dia principal</p>
                <p className="text-slate-600 text-xs mt-1">
                  Além do crachá lido por um operador, a equipe também pode escanear o QR fixo
                  da portaria e registrar a própria entrada/saída pelo celular, com localização
                  — o mesmo caminho que já funciona sempre na montagem e desmontagem.
                </p>
                <p className="text-slate-500 text-xs mt-1.5">
                  Use pra aliviar a fila num show grande: quem preferir continua indo pelo
                  crachá, normalmente.
                </p>
              </div>
            </div>
          </label>

          <div className="space-y-3">
            {janelas.map(j => (
              <div key={j.key} data-tutorial={`edt-janela-${j.key}`} className={`bg-white rounded-2xl border ${j.border} p-4 space-y-3`}>
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg ${j.bg} flex items-center justify-center shrink-0`}>
                    <j.icon className={`w-3.5 h-3.5 ${j.color}`} />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{j.label}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Início" compact>
                    <DateTimePicker name={`janela_${j.key}_inicio`} defaultValue={fmt(evento[`janela_${j.key}_inicio`])} />
                  </Field>
                  <Field label="Fim" compact>
                    <DateTimePicker name={`janela_${j.key}_fim`} defaultValue={fmt(evento[`janela_${j.key}_fim`])} />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          {/* O meio não tem HORÁRIO para configurar (ele é a entrada real de
              cada pessoa + 4h), mas tem PÚBLICO e DIAS — e essa é a decisão
              de custo mais cara do sistema: duas mensagens cobradas por
              pessoa por dia. Ver lib/meio.ts. */}
          <ConfiguracaoDoMeio eventoId={id} config={configMeio} />
        </div>

        {/*
          DIAS DE TRABALHO — montagem, dia do evento e desmontagem.

          Voltou a pedido, agora com as três etapas explícitas. Cada uma tem o
          seu próprio QR Code (ver lib/credencial-qr.ts); a credencial troca
          sozinha na virada do dia e a equipe não recebe mensagem nova.

          Os avisos automáticos de montagem e desmontagem seguem DESLIGADOS no
          painel de WhatsApp → Fluxos automáticos. Marcar os dias aqui não
          religa mensagem nenhuma — são coisas separadas de propósito.
        */}
        <div className="p-6 sm:p-8 space-y-4 border-t border-slate-100" data-tutorial="edt-dias">
          <SectionTitle
            title="Dias de trabalho do evento"
            subtitle="Montagem, dia do evento e desmontagem — marque os dias em que a equipe trabalha"
            icon={CalendarRange}
          />
          <DiasDeTrabalho eventoId={id} diaPrincipal={diaPrincipal} iniciais={dias} />
        </div>

        {/* Ação */}
        <div className="p-6 sm:p-8 pt-6 border-t border-slate-100 space-y-4">
          <ConferenciaDeHorarios />
          <button
            type="submit"
            data-tutorial="edt-salvar"
            className="btn btn-primario btn-lg w-full"
          >
            <Save className="w-4 h-4" />
            Salvar alterações
          </button>
        </div>
        <FormLoadingOverlay mensagem="Salvando evento..." />
      </form>
    </div>
    </TutorialProvider>
  )
}

function SectionTitle({ title, subtitle, icon: Icon }: { title: string; subtitle: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="w-4 h-4 text-slate-400" />}
      <div>
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </div>
  )
}

function Field({ label, children, icon: Icon, compact, tutorial }: { label: string; children: React.ReactNode; icon?: React.ElementType; compact?: boolean; tutorial?: string }) {
  return (
    <div className="space-y-1.5" data-tutorial={tutorial}>
      <label className={`flex items-center gap-1.5 font-medium text-slate-700 ${compact ? 'text-xs' : 'text-sm'}`}>
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
        {label}
      </label>
      {children}
    </div>
  )
}
