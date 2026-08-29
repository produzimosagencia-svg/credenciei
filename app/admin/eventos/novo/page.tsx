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
      descricao: 'O período em que o evento acontece. É ele que delimita tudo: fora deste intervalo ninguém consegue bater ponto. Dentro dele, entrada e saída são livres em qualquer dia — inclusive nos dias de montagem e desmontagem.' },
    { alvo: 'evt-novo-janelas', titulo: 'Horários do dia principal', posicao: 'right',
      descricao: 'O dia principal é a data de INÍCIO do evento — o dia que tem portaria e horário combinado com o cliente. Só nele estes horários travam a entrada e a saída. Nos outros dias do período a equipe bate ponto a qualquer hora.' },
    { alvo: 'evt-novo-janela-entrada', titulo: 'Entrada do dia principal', posicao: 'right',
      descricao: 'Período de credenciamento na chegada, no dia principal. Dê folga: se a equipe chega às 14h, abra às 13h e feche às 15h, senão quem atrasar fica travado. Deixe em branco para que a entrada seja livre também neste dia.' },
    { alvo: 'evt-novo-janela-meio', titulo: 'Meio do dia principal', posicao: 'right',
      descricao: 'A hora em que a equipe confirma que continua no posto, no dia do evento. Aqui não tem QR: o próprio funcionário abre a credencial e tira uma selfie. Nos dias de preparação este horário não vale — lá o meio abre 4h depois da entrada de cada pessoa.' },
    { alvo: 'evt-novo-janela-fim', titulo: 'Saída do dia principal', posicao: 'right',
      descricao: 'Descredenciamento na saída. Quem bate a saída no dia principal é automaticamente descredenciado do evento — sai das listas, mas continua na base e com todo o histórico.' },
    { alvo: 'evt-novo-janelas', titulo: 'E os dias de montagem?', posicao: 'right',
      descricao: 'Depois de criar o evento, abra "Editar evento" e marque os dias de preparação. Neles a entrada e a saída são livres, e o meio é contado 4 horas depois da entrada de cada pessoa.' },
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
    // Só entrada e saída: o meio é sempre a entrada real de cada pessoa + 4h,
    // e por isso não tem o que configurar.
    { key: 'entrada', label: 'Entrada', cor: 'text-green-600' },
    { key: 'fim', label: 'Saída', cor: 'text-brand-600' },
  ] as const
  return (
    <div className="border-t border-slate-100 pt-4 space-y-3" data-tutorial="evt-novo-janelas">
      <div>
        <p className="text-sm font-semibold text-slate-700">Horários do dia principal</p>
        <p className="text-xs text-slate-400">
          Quando a equipe pode bater entrada e saída no dia do evento. O meio não entra aqui:
          o sistema pede a batida por foto 4 horas depois da entrada de cada pessoa.
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
