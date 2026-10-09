'use client'
import { useMemo, useState } from 'react'
import { Search, MapPin, FileSpreadsheet, ShieldAlert, ExternalLink } from 'lucide-react'
import { Secao, Cartao, Badge, EmptyState, Aviso } from '@/components/ui/Superficie'
import type { RelatorioForaDoLocal, LinhaForaDoLocal } from '@/lib/alertas-local'
import { formatarBR } from '@/lib/tz'
import { ROTULO_TIPO, distancia, linkMapa, baixarPlanilhaForaDoLocal } from '@/lib/relatorio-fora-local-excel'

/**
 * "Quem bateu fora do limite da área precisa ter um relatório" (Juan, 08/10/2026). Os dados vêm prontos de
 * `obterRelatorioForaDoLocal`; aqui só filtra, desenha e baixa a planilha.
 */
export default function RelatorioForaDoLocalView({ relatorio, eventoNome, eventoInteiro }: {
  relatorio: RelatorioForaDoLocal; eventoNome: string
  /** Admin/master: o evento inteiro. Supervisor: só os setores dele (o servidor já mandou só esses). */
  eventoInteiro: boolean
}) {
  const [busca, setBusca] = useState('')
  const [setor, setSetor] = useState<string>(() => (!eventoInteiro && relatorio.setores.length === 1 ? relatorio.setores[0].id : ''))
  const [baixando, setBaixando] = useState(false)

  // O recorte (evento inteiro, todos os setores do supervisor, ou um setor) vale pra tela E pra planilha.
  const doRecorte = useMemo(
    () => (setor ? relatorio.linhas.filter(l => l.setorId === setor) : relatorio.linhas),
    [relatorio.linhas, setor],
  )
  const nomeRecorte = setor
    ? (relatorio.setores.find(st => st.id === setor)?.nome ?? 'setor')
    : eventoInteiro ? 'todo o evento' : 'meus setores'

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return doRecorte
    return doRecorte.filter(l =>
      l.funcionarioNome.toLowerCase().includes(termo) || (l.setorNome ?? '').toLowerCase().includes(termo)
      || l.quemRegistrou.toLowerCase().includes(termo))
  }, [doRecorte, busca])

  if (!relatorio.localConfigurado) {
    return (
      <Aviso tom="atencao" icone={<MapPin className="w-4 h-4" />}>
        Este evento ainda não tem o local marcado no mapa — sem ele não há com o que comparar. Marque em
        Editar evento → Local do evento no mapa.
      </Aviso>
    )
  }

  const registradas = filtradas.filter(l => l.situacao === 'registrada')
  const recusadas = filtradas.filter(l => l.situacao === 'recusada')

  const lista = (linhas: LinhaForaDoLocal[]) => (
    <div className="space-y-2">
      {linhas.map(l => {
        const mapa = linkMapa(l)
        return (
          <Cartao key={l.id} padding="sm">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="min-w-0">
                <p className="text-slate-800 font-semibold text-sm truncate">{l.funcionarioNome}</p>
                <p className="text-slate-400 text-xs mt-0.5 truncate">{l.setorNome ?? 'sem setor'} · {l.quemRegistrou}</p>
                {l.endereco && <p className="text-slate-500 text-xs mt-1">{l.endereco}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end shrink-0">
                {l.tipo && <Badge tom="neutro">{ROTULO_TIPO[l.tipo]}</Badge>}
                <Badge tom="negativo">{distancia(l.distanciaM)} do local</Badge>
                <span className="text-slate-500 text-xs tabular-nums">{formatarBR(l.quando, 'curto')}</span>
                {mapa && (
                  <a href={mapa} target="_blank" rel="noopener noreferrer" className="btn btn-secundario btn-sm">
                    <ExternalLink className="w-3 h-3 shrink-0" /> Mapa
                  </a>
                )}
              </div>
            </div>
          </Cartao>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tom="negativo">{doRecorte.filter(l => l.situacao === 'registrada').length} registrada(s) fora</Badge>
          <Badge tom="atencao">{doRecorte.filter(l => l.situacao === 'recusada').length} tentativa(s) recusada(s)</Badge>
          <span className="text-slate-400 text-xs">raio do local: {relatorio.raioM} m</span>
        </div>
        {/* Evento inteiro ou um setor — o supervisor só tem os setores dele na lista. */}
        {(eventoInteiro || relatorio.setores.length > 1) && (
          <select
            value={setor} onChange={e => setSetor(e.target.value)}
            aria-label="Recorte do relatório"
            className="input text-sm lg:ml-auto lg:max-w-xs w-full"
          >
            <option value="">{eventoInteiro ? 'Todo o evento' : 'Todos os meus setores'}</option>
            {relatorio.setores.map(st => <option key={st.id} value={st.id}>{st.nome}</option>)}
          </select>
        )}
        <button
          type="button" disabled={baixando || !filtradas.length}
          onClick={async () => { setBaixando(true); try { await baixarPlanilhaForaDoLocal(filtradas, eventoNome, relatorio.raioM, nomeRecorte) } finally { setBaixando(false) } }}
          className={`btn btn-secundario shrink-0 ${eventoInteiro || relatorio.setores.length > 1 ? '' : 'lg:ml-auto'}`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" /> {baixando ? 'Gerando…' : `Baixar planilha (${nomeRecorte})`}
        </button>
        <div className="relative sm:max-w-xs w-full">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, setor ou operador…" className="input pl-8 text-sm w-full" />
        </div>
      </div>

      {!doRecorte.length ? (
        <EmptyState icone={<ShieldAlert className="w-7 h-7" />} titulo="Nenhuma batida fora do local" descricao={`Nada fora do raio do evento em ${nomeRecorte}.`} />
      ) : (
        <>
          {registradas.length > 0 && (
            <Secao titulo="Batidas registradas fora do local" descricao="Valeram e estão no ponto — confira se a pessoa estava mesmo no evento" icone={<MapPin className="w-3.5 h-3.5" />} tom="aviso">
              {lista(registradas)}
            </Secao>
          )}
          {recusadas.length > 0 && (
            <Secao titulo="Tentativas recusadas" descricao="O sistema barrou por estar fora do raio — não viraram batida" icone={<ShieldAlert className="w-3.5 h-3.5" />}>
              {lista(recusadas)}
            </Secao>
          )}
          {!registradas.length && !recusadas.length && <EmptyState icone={<Search className="w-7 h-7" />} titulo="Ninguém encontrado para essa busca." />}
        </>
      )}
    </div>
  )
}
