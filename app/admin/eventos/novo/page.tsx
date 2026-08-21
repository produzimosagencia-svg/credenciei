import { criarEvento } from '@/lib/actions'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/Superficie'
import { getPerfil, licencasDeEventoRestantes, supabaseAdmin } from '@/lib/supabase-server'
import { NomeInput } from '@/components/inputs'
import DateTimePicker from '@/components/DateTimePicker'
import { FormLoadingOverlay } from '@/components/LoadingOverlay'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'
import { ehMaster } from '@/lib/permissions'

const TUTORIAL: TutorialConfig = {
  tela: 'evento-novo',
  versao: 1,
  passos: [
    { alvo: 'evt-novo-nome', titulo: 'Nome do evento', posicao: 'bottom',
      descricao: 'É como o evento aparece pra você, pros supervisores e no formulário que a equipe preenche. Use um nome que identifique bem, tipo "Show da Virada 2026".' },
    { alvo: 'evt-novo-datas', titulo: 'Início e fim do evento', posicao: 'bottom',
      descricao: 'O período em que o evento acontece. Serve de referência geral — quem controla os horários de bater ponto são as janelas, mais abaixo.' },
    { alvo: 'evt-novo-janelas', titulo: 'Janelas de registro: o mais importante', posicao: 'right',
      descricao: 'Uma janela é o intervalo em que o sistema aceita registrar presença. Fora dela, ninguém consegue bater ponto — o sistema recusa e avisa que o horário não abriu ou já encerrou. São três momentos independentes: entrada, meio e fim.' },
    { alvo: 'evt-novo-janela-entrada', titulo: 'Janela de entrada (chegada)', posicao: 'right',
      descricao: 'Período de credenciamento na chegada, feito pelo supervisor lendo o QR Code de cada pessoa no portão. Dê folga no horário: se a equipe chega às 14h, abra às 13h e feche às 15h, senão quem atrasar fica travado.' },
    { alvo: 'evt-novo-janela-meio', titulo: 'Janela do meio (durante o evento)', posicao: 'right',
      descricao: 'Confirmação de que a pessoa continua no posto. Aqui não tem QR: o próprio funcionário abre a credencial no celular e tira uma selfie, e o sistema grava a foto e a localização dele. Escolha um horário no meio do turno.' },
    { alvo: 'evt-novo-janela-fim', titulo: 'Janela de fim (saída)', posicao: 'right',
      descricao: 'Descredenciamento na saída, de novo por QR Code com o supervisor. É o que fecha o ciclo e permite conferir quem cumpriu o turno inteiro.' },
    { alvo: 'evt-novo-janelas', titulo: 'Pode deixar em branco agora', posicao: 'right',
      descricao: 'Se ainda não sabe os horários, deixe vazio e preencha depois em "Editar" — só lembre que, enquanto a janela estiver em branco, aquela etapa fica bloqueada e ninguém consegue registrar presença nela. O sistema também usa esses horários pra disparar os lembretes no WhatsApp da equipe.' },
    { alvo: 'evt-novo-submit', titulo: 'Criar o evento', posicao: 'top',
      descricao: 'Depois de criar, o próximo passo é abrir o evento e cadastrar os setores (fornecedores). Cada setor gera um link próprio pra equipe se cadastrar sozinha.' },
  ],
}

export default async function NovoEventoPage() {
  const perfil = await getPerfil()
  // Sem licença de evento disponível → volta para a lista
  if ((await licencasDeEventoRestantes(perfil)) <= 0) redirect('/admin/eventos')

  /*
   * O master não pertence a organização nenhuma, então precisa DIZER de quem é
   * o evento. Sem isso ele nascia órfão: sem dono, invisível pra todo admin, e
   * com supervisores criados sem vínculo. O admin não vê este campo — o evento
   * dele é sempre da própria organização.
   */
  const organizacoes = ehMaster(perfil?.role)
    ? (await supabaseAdmin.from('organizacoes').select('id, nome, ativo').order('nome')).data ?? []
    : []

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil?.role)}>
      <div className="max-w-xl space-y-6">
        <PageHeader
          voltarPara="/admin/eventos"
          titulo="Novo Evento"
          descricao="Preencha os dados do evento"
          acoes={<TutorialButton />}
        />
        <EventoForm action={criarEvento} submitLabel="Criar Evento" organizacoes={organizacoes} />
      </div>
    </TutorialProvider>
  )
}

type EventoDefaults = {
  nome?: string; descricao?: string; data_inicio?: string; data_fim?: string; local?: string
  janela_entrada_inicio?: string; janela_entrada_fim?: string
  janela_meio_inicio?: string; janela_meio_fim?: string
  janela_fim_inicio?: string; janela_fim_fim?: string
}

function EventoForm({ action, submitLabel, defaults, organizacoes = [] }: {
  action: (formData: FormData) => Promise<void>
  submitLabel: string
  defaults?: EventoDefaults
  /** Só o master recebe a lista; vazia esconde o campo. */
  organizacoes?: { id: string; nome: string; ativo: boolean }[]
}) {
  return (
    <form action={action} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
      {!!organizacoes.length && (
        <Field label="Organização dona do evento *">
          <select name="organizacao_id" required defaultValue="" className="input">
            <option value="" disabled>Escolha o cliente…</option>
            {organizacoes.map(o => (
              <option key={o.id} value={o.id} disabled={!o.ativo}>
                {o.nome}{o.ativo ? '' : ' (suspensa)'}
              </option>
            ))}
          </select>
          <p className="text-slate-500 text-xs mt-1.5">
            É quem vai enxergar e operar este evento. Sem dono, o evento não aparece pra nenhum administrador.
          </p>
        </Field>
      )}
      <Field label="Nome do evento *" tutorial="evt-novo-nome">
        <NomeInput name="nome" required defaultValue={defaults?.nome} placeholder="Ex: Feira do Empreendedor 2025" className="input" />
      </Field>
      <Field label="Descrição">
        <textarea name="descricao" rows={2} defaultValue={defaults?.descricao ?? ''} placeholder="Descrição opcional" className="input resize-none" />
      </Field>
      <div className="grid grid-cols-2 gap-4" data-tutorial="evt-novo-datas">
        <Field label="Data de início *">
          <DateTimePicker name="data_inicio" required defaultValue={defaults?.data_inicio} />
        </Field>
        <Field label="Data de fim *">
          <DateTimePicker name="data_fim" required defaultValue={defaults?.data_fim} />
        </Field>
      </div>
      <Field label="Local">
        <NomeInput name="local" defaultValue={defaults?.local ?? ''} placeholder="Ex: Expo Center Norte, São Paulo" className="input" />
      </Field>

      <JanelasHorario defaults={defaults} />

      <button type="submit" data-tutorial="evt-novo-submit" className="w-full btn btn-primario btn-lg">
        {submitLabel}
      </button>
      <FormLoadingOverlay mensagem="Criando evento..." />
    </form>
  )
}

function JanelasHorario({ defaults }: { defaults?: EventoDefaults }) {
  const janelas = [
    { key: 'entrada', label: 'Entrada', cor: 'text-green-600' },
    { key: 'meio', label: 'Meio (durante o evento)', cor: 'text-blue-600' },
    { key: 'fim', label: 'Fim', cor: 'text-brand-600' },
  ] as const
  return (
    <div className="border-t border-slate-100 pt-4 space-y-3" data-tutorial="evt-novo-janelas">
      <div>
        <p className="text-sm font-semibold text-slate-700">Janelas de registro de presença</p>
        <p className="text-xs text-slate-400">
          Cada janela é o intervalo em que o sistema aceita o registro daquela etapa. Fora dela,
          ninguém consegue bater ponto. Deixe em branco pra definir depois — enquanto estiver
          vazia, a etapa fica bloqueada.
        </p>
      </div>
      {janelas.map(j => (
        <div key={j.key} className="grid grid-cols-2 gap-3" data-tutorial={`evt-novo-janela-${j.key}`}>
          <Field label={`${j.label} — início`}>
            <DateTimePicker name={`janela_${j.key}_inicio`} defaultValue={defaults?.[`janela_${j.key}_inicio` as keyof EventoDefaults]} />
          </Field>
          <Field label={`${j.label} — fim`}>
            <DateTimePicker name={`janela_${j.key}_fim`} defaultValue={defaults?.[`janela_${j.key}_fim` as keyof EventoDefaults]} />
          </Field>
        </div>
      ))}
    </div>
  )
}

function Field({ label, children, tutorial }: { label: string; children: React.ReactNode; tutorial?: string }) {
  return (
    <div className="space-y-1.5" data-tutorial={tutorial}>
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  )
}

export { EventoForm }
