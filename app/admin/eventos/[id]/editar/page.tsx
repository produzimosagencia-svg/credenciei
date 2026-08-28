import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { notFound, redirect } from 'next/navigation'
import { editarEvento } from '@/lib/actions'
import { isoParaInput } from '@/lib/tz'
import { NomeInput } from '@/components/inputs'
import DateTimePicker from '@/components/DateTimePicker'
import { FormLoadingOverlay } from '@/components/LoadingOverlay'
import { CalendarDays, MapPin, LogIn, LogOut, Save, MessageCircle } from 'lucide-react'
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
      descricao: 'Só valem no dia de início do evento — nos outros dias do período a equipe bate ponto a qualquer hora. Mudar um horário aqui reagenda os lembretes de WhatsApp da equipe inteira, inclusive de quem já foi avisado.' },
    { alvo: 'edt-janela-fim', titulo: 'E o meio do turno?', posicao: 'right', icone: 'Camera',
      descricao: 'O meio não tem horário aqui: abre 4 horas depois da entrada de cada pessoa e fica aberto por 2 horas. Nele não tem QR — o próprio funcionário tira uma selfie com a localização ligada, sem precisar procurar ninguém.' },
    { alvo: 'edt-msg-envio', titulo: 'Quando enviar a confirmação', posicao: 'right', icone: 'MessageCircle',
      descricao: 'Data e hora em que a equipe recebe a confirmação de escala no WhatsApp. Deixe em branco para não enviar essa mensagem.' },
    { alvo: 'edt-msg-texto', titulo: 'Instruções do evento', posicao: 'top', icone: 'MessageCircle',
      descricao: 'Texto livre que entra na confirmação de escala, junto com função, setor, data e local. Use para o que é específico deste evento: uniforme, documento, ponto de encontro.' },
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

  const janelas = [
    // Sem o "meio": ele virou entrada real + 4h, por pessoa. Um campo que o
    // sistema ignora engana quem preenche.
    { key: 'entrada', label: 'Entrada', icon: LogIn, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
    { key: 'fim', label: 'Saída', icon: LogOut, color: 'text-brand-600', bg: 'bg-brand-50', border: 'border-brand-100' },
  ] as const

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil?.role)}>
    <div className="max-w-2xl space-y-6">
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
            subtitle="Valem só no dia de início do evento. Nos demais dias, entrada e saída são livres; o meio abre 4h depois da entrada de cada pessoa."
          />
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
        </div>

        {/* Mensagem pré-evento */}
        <div className="p-6 sm:p-8 space-y-4 border-t border-slate-100">
          <SectionTitle
            title="Mensagem pré-evento (WhatsApp)"
            subtitle="Confirmação de escala enviada aos funcionários antes do evento, com instruções personalizadas"
            icon={MessageCircle}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Enviar em" tutorial="edt-msg-envio">
              <DateTimePicker name="msg_pre_evento_envio" defaultValue={fmt(evento.msg_pre_evento_envio)} />
            </Field>
          </div>
          <Field label="Instruções do evento (opcional)" tutorial="edt-msg-texto">
            <textarea
              name="msg_pre_evento_instrucoes"
              rows={3}
              defaultValue={evento.msg_pre_evento_instrucoes ?? ''}
              placeholder="Ex: Leve seu documento com foto e esteja com o uniforme da sua empresa."
              className="input resize-none"
            />
            <p className="text-2xs text-slate-400 mt-1">
              Este texto entra na mensagem de confirmação de escala, junto com função, setor, data e local. Deixe o horário em branco para não enviar.
            </p>
          </Field>
        </div>

        {/* Ação */}
        <div className="p-6 sm:p-8 pt-6 border-t border-slate-100">
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
