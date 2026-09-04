import { notFound } from 'next/navigation'
import { Users, CalendarDays, MapPin } from 'lucide-react'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { formatarBR } from '@/lib/tz'
import { periodoDoEvento, diaBRT, type EventoJanelas } from '@/lib/janelas'
import IdentificarPorCpf from './IdentificarPorCpf'

export const revalidate = 0

/**
 * A porta de entrada da portaria.
 *
 * Alguém chega ao evento sem estar na lista, aponta a câmera para o cartaz e
 * cai aqui. Escolhe o setor e vai para o formulário — que já existia e já
 * resolve o difícil: valida CPF, impede duplicidade, devolve a credencial de
 * quem já está cadastrado, recusa a mesma pessoa em dois setores, sobe foto e
 * agenda as boas-vindas.
 *
 * Esta tela não cadastra ninguém. Ela só descobre em qual formulário a pessoa
 * deveria estar — e é por isso que ela é pequena: reaproveitar o fluxo que já
 * roda em produção vale mais do que um caminho novo, que precisaria repetir
 * cada uma daquelas regras e envelheceria em paralelo.
 *
 * ─── PÚBLICA, SEM LOGIN ─────────────────────────────────────────────────────
 *
 * Tem que ser: quem chega não tem conta, não tem app, e está com fila atrás.
 * O que protege é o token no endereço — trocar o token invalida todo cartaz já
 * impresso — e o interruptor `portaria_ativa`, que o produtor desliga quando o
 * credenciamento fecha.
 */

type EventoDaPortaria = EventoJanelas & {
  id: string
  nome: string
  local: string | null
  ativo: boolean
  portaria_ativa: boolean
  cadastro_suspenso?: boolean | null
}

export default async function PortariaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const { data: evento } = await supabase
    .from('eventos')
    .select('id, nome, local, ativo, portaria_ativa, cadastro_suspenso, data_inicio, data_fim')
    .eq('token_portaria', token)
    .maybeSingle<EventoDaPortaria>()

  // Token que não existe e token de evento apagado devolvem a mesma coisa: um
  // cartaz velho não deve conseguir dizer se aquele evento um dia existiu.
  if (!evento) notFound()

  const periodo = periodoDoEvento(evento)
  const hoje = diaBRT()
  const forado = !!periodo && hoje > periodo.ultimo

  // `cadastro_suspenso`: a organização fechou a lista (botão na tela do evento).
  if (!evento.ativo || !evento.portaria_ativa || evento.cadastro_suspenso || forado) {
    return <Fechado motivo={forado ? 'O evento já terminou.' : null} />
  }

  const { data: setores } = await supabase
    .from('fornecedores')
    .select('id, nome, token_formulario, link_ativo')
    .eq('evento_id', evento.id)
    .order('nome')

  /*
   * Setor com o link desligado não aparece pra escolher.
   *
   * Deixá-lo na lista levaria a pessoa até o formulário só pra ela bater
   * na recusa lá dentro — com fila atrás, no portão. `link_ativo` pode vir
   * `undefined` se a migração ainda não rodou; aí vale como ligado, e o
   * cartaz segue funcionando como antes.
   */
  const disponiveis = (setores ?? []).filter(s => s.token_formulario && s.link_ativo !== false)

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex flex-col">
      <header className="bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-7 text-center">
        <p className="text-brand-100 text-2xs uppercase tracking-widest font-semibold">
          Cadastro no evento
        </p>
        <h1 className="text-white font-bold text-2xl mt-1.5 leading-tight text-balance">
          {evento.nome}
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2.5 text-brand-100 text-xs">
          {evento.data_inicio && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="w-3 h-3" /> {formatarBR(evento.data_inicio, 'data')}
            </span>
          )}
          {evento.local && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {evento.local}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 py-6 w-full max-w-md mx-auto">
        {!disponiveis.length ? (
          <div className="bg-white rounded-2xl p-6 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-slate-700 font-semibold mt-3">Ainda não há setores abertos</p>
            <p className="text-slate-500 text-sm mt-1">
              Procure o credenciamento do evento para fazer seu cadastro.
            </p>
          </div>
        ) : (
          <IdentificarPorCpf eventoId={evento.id} setores={disponiveis} />
        )}
      </main>
    </div>
  )
}

/**
 * O cartaz continua na parede depois de o evento acabar.
 *
 * Por isso a tela fechada explica em vez de dar erro: quem escaneou não fez
 * nada errado, e "página não encontrada" faria a pessoa achar que o celular
 * dela é que falhou, e tentar de novo várias vezes.
 */
function Fechado({ motivo }: { motivo: string | null }) {
  return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-7 max-w-sm text-center shadow-xl">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
          <Users className="w-6 h-6 text-slate-400" />
        </div>
        <h1 className="text-slate-900 font-bold text-lg mt-4">
          Este cadastro não está mais disponível
        </h1>
        <p className="text-slate-500 text-sm mt-2">
          {motivo ?? 'O cadastro por aqui foi encerrado pelo organizador.'}
        </p>
        <p className="text-slate-400 text-xs mt-4">
          Se você trabalha neste evento, procure o credenciamento.
        </p>
      </div>
    </div>
  )
}
