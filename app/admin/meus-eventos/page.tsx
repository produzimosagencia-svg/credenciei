import { redirect } from 'next/navigation'
import { CalendarDays, PartyPopper } from 'lucide-react'
import { getPerfil, meusSetores, comArea } from '@/lib/supabase-server'
import { eventosDosMeusSetores, eventosDaOrganizacao, type EventoEscolhivel } from '../EscolherEvento'
import { Secao, EmptyState } from '@/components/ui/Superficie'
import EscolherMeuEvento, { type SetorComArea } from './EscolherMeuEvento'

export const revalidate = 0

/**
 * "Meus eventos" — pedido do Juan, 02/10/2026: o supervisor trabalha em mais
 * de um evento ao longo do tempo (ex.: Pontal Weekend ontem, Stoked agora), e
 * entrar direto no último setor ativo escondia isso — testando o acesso
 * antes do Stoked abrir, ele caía sem perceber dentro do Pontal, se o evento
 * antigo ainda estivesse no sistema. Esta tela separa EVENTOS ATUAIS (acesso
 * ativo) de EVENTOS PASSADOS (encerrados, mas sem apagar o histórico) e pede
 * a escolha explicitamente, toda vez — é a tela de entrada do supervisor,
 * mesmo papel que `/admin/bem-vindo` cumpre pro operador de portão (mesmo
 * tom de boas-vindas aqui, pedido do Juan, 02/10/2026 à tarde: "ficou legal,
 * quero igual pro supervisor").
 *
 * Os dados vêm de `eventosDosMeusSetores` — devolve só os eventos onde a
 * pessoa tem (ou teve) um vínculo de `supervisor_setores`, com o `ativo` do
 * evento junto. Isso vale tanto pra quem É supervisor quanto pra quem só
 * GANHOU um vínculo mantendo outro papel principal (ex.: operador de
 * portão que também supervisiona um fornecedor — caso da Mara Lúcia,
 * 04/10/2026: o gate antigo, travado em `role === 'supervisor'`, mandava
 * essa gente de volta pra `/admin`, que não sabia o que fazer com ela e
 * mostrava "nenhum evento".
 * `meusSetores` entra só pra enriquecer cada cartão com O NOME DO SETOR DELE
 * naquele evento — sem isso o cartão dizia só o nome do evento, e quem cobre
 * dois fornecedores no mesmo evento não sabia qual dos dois ia abrir.
 *
 * Quem NÃO É supervisor (ex.: operador de portão) ganha também, mesclado,
 * `eventosDaOrganizacao` — achado ao vivo, 05/10/2026, mesmo caso da Mara
 * Lúcia: via só a Stoked (o vínculo novo) e o Henrique e Juliano, onde ela
 * trabalhou como operadora de portão, tinha sumido — esse papel nunca teve
 * vínculo fino por evento, só escopo de organização inteira. Supervisor de
 * verdade NUNCA ganha isso — manteria o escopo fino de sempre (só o setor
 * dele), sem vazar o resto da organização.
 */
export default async function MeusEventosPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const setores = await meusSetores(perfil)
  if (perfil.role !== 'supervisor' && !setores.length) redirect('/admin')

  const eventosVinculo = await eventosDosMeusSetores(setores)
  let eventos: EventoEscolhivel[] = eventosVinculo
  if (perfil.role !== 'supervisor') {
    const daOrg = await eventosDaOrganizacao((perfil.organizacao_id as string | null) ?? null)
    const vistos = new Set(eventosVinculo.map(e => e.id))
    eventos = [...eventosVinculo, ...daOrg.filter(e => !vistos.has(e.id))]
      .sort((a, b) => (b.data_inicio ?? '').localeCompare(a.data_inicio ?? ''))
  }
  const atuais = eventos.filter(e => e.ativo)
  const passados = eventos.filter(e => !e.ativo)

  // Os setores dele em cada evento, com a área (subgrupo) — quem tem mais de
  // um escolhe onde atuar antes de entrar (ver EscolherMeuEvento).
  const setoresPorEvento = new Map<string, SetorComArea[]>()
  for (const s of await comArea(setores)) {
    const lista = setoresPorEvento.get(s.evento_id) ?? []
    lista.push({ id: s.id, nome: s.nome, area: s.area })
    setoresPorEvento.set(s.evento_id, lista)
  }

  return (
    <div className="space-y-5">
      <div className="text-center pt-2 pb-1">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
          <PartyPopper className="w-7 h-7 text-brand-500" />
        </div>
        {atuais.length === 1 ? (
          <>
            <h1 className="text-slate-800 font-bold text-2xl">Bem-vindo ao</h1>
            <p className="text-brand-500 font-extrabold text-3xl mt-1">{atuais[0].nome}</p>
          </>
        ) : atuais.length > 1 ? (
          <>
            <h1 className="text-slate-800 font-bold text-2xl">Bem-vindo!</h1>
            <p className="text-slate-500 text-sm mt-2">Você pode atuar nestes eventos agora:</p>
            <p className="text-brand-500 font-bold text-lg mt-1">{atuais.map(e => e.nome).join(' · ')}</p>
          </>
        ) : (
          <>
            <h1 className="text-slate-800 font-bold text-2xl">Meus eventos</h1>
            <p className="text-slate-500 text-sm mt-2">
              {passados.length ? 'Nenhum evento ativo agora — mas seu histórico continua abaixo.' : 'Escolha o evento que você quer acessar.'}
            </p>
          </>
        )}
      </div>

      {!eventos.length && (
        <Secao tom="acento" icone={<CalendarDays className="w-4 h-4" />} titulo="Meus eventos">
          <EmptyState
            icone={<CalendarDays className="w-6 h-6" />}
            titulo="Nenhum evento ainda"
            descricao="Você ainda não foi vinculado a um fornecedor em nenhum evento. Fale com quem administra sua organização."
          />
        </Secao>
      )}

      {!!atuais.length && (
        <Secao
          tom="acento"
          icone={<CalendarDays className="w-4 h-4" />}
          titulo="Eventos atuais"
          descricao="Onde você tem acesso ativo agora."
          corpoClassName=""
        >
          <EscolherMeuEvento eventos={atuais} setoresPorEvento={setoresPorEvento} />
        </Secao>
      )}

      {!!passados.length && (
        <Secao
          icone={<CalendarDays className="w-4 h-4" />}
          titulo="Eventos passados"
          descricao="Eventos encerrados em que você já trabalhou — ainda dá pra abrir e consultar."
          corpoClassName=""
        >
          <EscolherMeuEvento eventos={passados} setoresPorEvento={setoresPorEvento} />
        </Secao>
      )}
    </div>
  )
}
