import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Activity, QrCode, Camera, UserCheck, Clock, MapPin, ShieldCheck } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { veTodosEventos, podeEscanear } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { formatCpf } from '@/lib/format'
import { COR_ETAPA } from '@/components/charts'
import StatCard from '@/components/StatCard'
import { Secao, PageHeader, EmptyState, Badge } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * Atividades do evento — o log detalhado da operação.
 *
 * Não é o Painel. O Painel responde "como está"; esta tela responde "o que
 * aconteceu, na ordem, e por quem". Cada leitura de QR e cada check-in por foto
 * aparece aqui com horário, quem registrou e onde — é a tela que se abre quando
 * alguém contesta uma batida, e a que mostra nome por nome quem ainda não
 * chegou, em vez de só o número.
 */

const ETAPAS = ['entrada', 'meio', 'fim'] as const
type Etapa = (typeof ETAPAS)[number]

const ROTULO: Record<Etapa, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

/** Teto do log. Acima disso a página fica pesada e ninguém rola até o fim. */
const LIMITE_LOG = 200

type Linha = {
  id: string
  nome: string
  cpf: string
  setor: string
  etapa: Etapa
  em: string
  assistido: boolean
  temFoto: boolean
  local: string | null
  registradoPor: string | null
  justificativa: string | null
}

export default async function AtividadesPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string; etapa?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeEscanear(perfil.role)) redirect('/admin')

  const { evento: eventoParam, etapa: etapaParam } = await searchParams
  const filtroEtapa = ETAPAS.includes(etapaParam as Etapa) ? (etapaParam as Etapa) : null

  // ─── Escopo ───────────────────────────────────────────────────────────────
  // Mesma régua do resto do sistema: supervisor enxerga só o evento do próprio
  // setor, admin só a própria organização, master tudo.
  let setorDoSupervisor: string | null = null
  const listaQuery = supabaseAdmin
    .from('eventos')
    .select('id, nome, ativo, data_inicio')
    .order('data_inicio', { ascending: false })

  if (perfil.role === 'supervisor') {
    if (!perfil.fornecedor_id) redirect('/scan')
    const { data: setor } = await supabaseAdmin
      .from('fornecedores').select('id, evento_id').eq('id', perfil.fornecedor_id).single()
    if (!setor) redirect('/scan')
    setorDoSupervisor = setor.id
    listaQuery.eq('id', setor.evento_id)
  } else if (!veTodosEventos(perfil.role)) {
    listaQuery.eq('organizacao_id', perfil.organizacao_id)
  }

  const { data: eventos } = await listaQuery
  if (!eventos?.length) {
    return (
      <div className="space-y-5">
        <PageHeader titulo="Atividades do evento" descricao="Cada batida registrada, na ordem em que aconteceu" />
        <Secao titulo="Nenhum evento">
          <EmptyState
            icone={<Activity className="w-7 h-7" />}
            titulo="Não há evento para acompanhar"
            descricao="Crie um evento no Início para começar a registrar presenças."
          />
        </Secao>
      </div>
    )
  }

  // Sem escolha explícita, abre no evento que está acontecendo — é o que se
  // quer ver quando se abre esta tela no meio da operação.
  const escolhido = eventos.find(e => e.id === eventoParam) ?? eventos.find(e => e.ativo) ?? eventos[0]

  // ─── Dados do evento escolhido ────────────────────────────────────────────
  const setoresQuery = supabaseAdmin
    .from('fornecedores').select('id, nome').eq('evento_id', escolhido.id)
  if (setorDoSupervisor) setoresQuery.eq('id', setorDoSupervisor)
  const { data: setores } = await setoresQuery
  const idsSetores = (setores ?? []).map(s => s.id)
  const nomeSetor = new Map((setores ?? []).map(s => [s.id, s.nome]))

  if (!idsSetores.length) {
    return (
      <div className="space-y-5">
        <PageHeader titulo="Atividades do evento" descricao={escolhido.nome} />
        <Secao titulo="Sem setores">
          <EmptyState
            icone={<Activity className="w-7 h-7" />}
            titulo="Este evento ainda não tem setores"
            descricao="Sem setor não há equipe, e sem equipe não há batida para registrar."
          />
        </Secao>
      </div>
    )
  }

  const [{ data: equipe }, { data: registros }] = await Promise.all([
    supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, telefone, ativo, fornecedor_id')
      .in('fornecedor_id', idsSetores),
    supabaseAdmin
      .from('registros')
      .select('id, funcionario_id, tipo, created_at, foto_url, endereco_aproximado, registro_manual, justificativa, criado_por_perfil_id')
      .eq('evento_id', escolhido.id)
      .in('tipo', ETAPAS as unknown as string[])
      .order('created_at', { ascending: false })
      .limit(LIMITE_LOG),
  ])

  const dadosFunc = new Map((equipe ?? []).map(f => [f.id, f]))

  // Nome de quem registrou: só o log precisa disso, e são poucos perfis.
  const idsPerfis = [...new Set((registros ?? []).map(r => r.criado_por_perfil_id).filter((v): v is string => !!v))]
  const nomePerfil = new Map<string, string>()
  if (idsPerfis.length) {
    const { data: perfis } = await supabaseAdmin.from('perfis').select('id, nome').in('id', idsPerfis)
    for (const p of perfis ?? []) nomePerfil.set(p.id, p.nome)
  }

  // O registro traz o funcionário de qualquer setor do evento; quando é
  // supervisor, filtra pelos que são do setor dele.
  const linhas: Linha[] = (registros ?? [])
    .filter(r => dadosFunc.has(r.funcionario_id))
    .map(r => {
      const f = dadosFunc.get(r.funcionario_id)!
      return {
        id: r.id as string,
        nome: f.nome as string,
        cpf: f.cpf as string,
        setor: nomeSetor.get(f.fornecedor_id as string) ?? '—',
        etapa: r.tipo as Etapa,
        em: r.created_at as string,
        assistido: r.registro_manual === true,
        temFoto: !!r.foto_url,
        local: (r.endereco_aproximado as string | null) ?? null,
        registradoPor: r.criado_por_perfil_id ? nomePerfil.get(r.criado_por_perfil_id) ?? null : null,
        justificativa: (r.justificativa as string | null) ?? null,
      }
    })

  const doFiltro = filtroEtapa ? linhas.filter(l => l.etapa === filtroEtapa) : linhas

  // ─── Números ──────────────────────────────────────────────────────────────
  // Contam sobre TODOS os registros do evento (não só os do log, que é
  // limitado), então vêm de uma consulta própria de contagem.
  const { data: todosRegistros } = await supabaseAdmin
    .from('registros')
    .select('funcionario_id, tipo, created_at')
    .eq('evento_id', escolhido.id)
    .in('tipo', ETAPAS as unknown as string[])

  const idsEquipe = new Set((equipe ?? []).map(f => f.id))
  const meus = (todosRegistros ?? []).filter(r => idsEquipe.has(r.funcionario_id))
  const quemFez = (t: Etapa) => new Set(meus.filter(r => r.tipo === t).map(r => r.funcionario_id))
  const entraram = quemFez('entrada')
  const sairam = quemFez('fim')

  const ativos = (equipe ?? []).filter(f => f.ativo !== false)
  const naoChegaram = ativos.filter(f => !entraram.has(f.id))
  // "Presente agora" é quem entrou e ainda não bateu saída — é o número que o
  // produtor pergunta no rádio.
  const presentes = ativos.filter(f => entraram.has(f.id) && !sairam.has(f.id))
  const hoje = new Date().toDateString()
  const batidasHoje = meus.filter(r => new Date(r.created_at as string).toDateString() === hoje).length

  /** Preserva o evento ao trocar de filtro, e vice-versa. */
  const url = (mudanca: { evento?: string; etapa?: string | null }) => {
    const p = new URLSearchParams()
    const ev = mudanca.evento ?? escolhido.id
    const et = mudanca.etapa === undefined ? filtroEtapa : mudanca.etapa
    p.set('evento', ev)
    if (et) p.set('etapa', et)
    return `/admin/atividades?${p.toString()}`
  }

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Atividades do evento"
        descricao={`${escolhido.nome} — cada batida registrada, na ordem em que aconteceu`}
        acoes={
          eventos.length > 1 ? (
            /* Sem JS: um <select> dentro de form GET troca de evento. Esta tela
               é aberta no celular no meio do evento — não vale carregar um
               componente cliente só pra um seletor. */
            <form className="flex items-center gap-2">
              <label htmlFor="evento" className="text-slate-500 text-xs">Evento</label>
              <select
                id="evento"
                name="evento"
                defaultValue={escolhido.id}
                className="input w-auto"
              >
                {eventos.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.nome}{e.ativo ? '' : ' (encerrado)'}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-secundario">Ver</button>
            </form>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Batidas hoje" value={batidasHoje} icon={Activity} tom="acento" />
        <StatCard label="Presentes agora" value={presentes.length} sub={`de ${ativos.length} na equipe`} icon={UserCheck} tom="sucesso" />
        <StatCard label="Ainda não chegaram" value={naoChegaram.length} icon={Clock} tom="aviso" />
        <StatCard label="Já saíram" value={sairam.size} icon={ShieldCheck} tom="info" />
      </div>

      {/* Filtro por etapa — o log inteiro é longo, e quase sempre a pergunta é
          sobre uma etapa só ("quem bateu a saída?"). */}
      <div className="abas">
        <Link href={url({ etapa: null })} className={`aba ${!filtroEtapa ? 'aba-ativa' : ''}`}>
          Tudo
          <span className="aba-contador">{linhas.length}</span>
        </Link>
        {ETAPAS.map(t => (
          <Link key={t} href={url({ etapa: t })} className={`aba ${filtroEtapa === t ? 'aba-ativa' : ''}`}>
            {ROTULO[t]}
            <span className="aba-contador">{linhas.filter(l => l.etapa === t).length}</span>
          </Link>
        ))}
      </div>

      <Secao
        titulo="Linha do tempo"
        descricao={
          linhas.length >= LIMITE_LOG
            ? `Mostrando as ${LIMITE_LOG} batidas mais recentes deste evento`
            : 'Da mais recente para a mais antiga'
        }
      >
        {!doFiltro.length ? (
          <EmptyState
            icone={<Activity className="w-7 h-7" />}
            titulo={filtroEtapa ? `Nenhuma batida de ${ROTULO[filtroEtapa].toLowerCase()} ainda` : 'Nenhuma batida registrada ainda'}
            descricao="Assim que a equipe começar a passar pelo QR ou pelo check-in por foto, aparece aqui."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {doFiltro.map(l => (
              <div key={l.id} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                <span
                  className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                  style={{ background: COR_ETAPA[l.etapa] }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-slate-800 text-sm font-medium truncate">{l.nome}</p>
                    <Badge tom={l.etapa === 'entrada' ? 'positivo' : l.etapa === 'meio' ? 'marca' : 'neutro'}>
                      {ROTULO[l.etapa]}
                    </Badge>
                    {/* Como foi registrado é o que separa uma batida normal de
                        uma que alguém fez pela pessoa — é a primeira coisa que
                        se olha quando um registro é contestado. */}
                    {l.assistido ? (
                      <Badge tom="atencao">
                        <ShieldCheck className="w-3 h-3" /> Registro assistido
                      </Badge>
                    ) : l.temFoto ? (
                      <Badge tom="neutro">
                        <Camera className="w-3 h-3" /> Foto
                      </Badge>
                    ) : (
                      <Badge tom="neutro">
                        <QrCode className="w-3 h-3" /> QR Code
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-slate-500 text-xs">
                    <span className="tabular-nums">{formatarBR(l.em)}</span>
                    <span className="truncate">{l.setor}</span>
                    <span className="tabular-nums">{formatCpf(l.cpf)}</span>
                    {l.registradoPor && <span className="truncate">por {l.registradoPor}</span>}
                    {l.local && (
                      <span className="flex items-center gap-1 min-w-0">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{l.local}</span>
                      </span>
                    )}
                  </div>
                  {l.justificativa && (
                    <p className="text-slate-500 text-2xs italic">Justificativa: {l.justificativa}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Secao>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Secao
          titulo="Ainda não chegaram"
          descricao="Equipe ativa sem registro de entrada"
          acoes={
            <span className={`indicador-selo ${naoChegaram.length ? 'selo-aviso' : 'selo-sucesso'}`}>
              {naoChegaram.length}
            </span>
          }
        >
          {!naoChegaram.length ? (
            <EmptyState titulo="Todo mundo já bateu a entrada" />
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {naoChegaram.map(f => (
                <div key={f.id} className="px-4 py-2.5">
                  <p className="text-slate-800 text-sm font-medium truncate">{f.nome}</p>
                  <p className="text-slate-500 text-xs">
                    {nomeSetor.get(f.fornecedor_id as string) ?? '—'}
                    {f.telefone ? ` · ${f.telefone}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Secao>

        <Secao
          titulo="Ainda no evento"
          descricao="Bateram entrada e não bateram saída"
          acoes={<span className="indicador-selo selo-sucesso">{presentes.length}</span>}
        >
          {!presentes.length ? (
            <EmptyState titulo="Ninguém dentro do evento agora" />
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {presentes.map(f => (
                <div key={f.id} className="px-4 py-2.5">
                  <p className="text-slate-800 text-sm font-medium truncate">{f.nome}</p>
                  <p className="text-slate-500 text-xs">
                    {nomeSetor.get(f.fornecedor_id as string) ?? '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Secao>
      </div>
    </div>
  )
}
