'use client'
import { useMemo, useState } from 'react'
import { Search, MapPin, FileSpreadsheet, ShieldAlert, ExternalLink } from 'lucide-react'
import { Secao, Cartao, Badge, EmptyState, Aviso } from '@/components/ui/Superficie'
import type { RelatorioForaDoLocal, LinhaForaDoLocal } from '@/lib/alertas-local'
import { formatarBR } from '@/lib/tz'

const ROTULO_TIPO: Record<string, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

const distancia = (m: number | null) =>
  m == null ? '—' : m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${m} m`

const linkMapa = (l: LinhaForaDoLocal) =>
  l.latitude != null && l.longitude != null ? `https://www.google.com/maps?q=${l.latitude},${l.longitude}` : null

async function baixarPlanilha(linhas: LinhaForaDoLocal[], eventoNome: string, raioM: number | null, recorte: string) {
  const ExcelJS = await import('exceljs')
  const { COR_MARCA, COR_ACENTO, COR_FAIXA_CLARA, COR_TEXTO, BRANCO, BORDA_CELULA, carregarLogoBuffer, adicionarLogoNaAba } = await import('@/lib/marca-relatorio')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Fora do local')
  const colunas = [
    { titulo: 'Situação', largura: 12 }, { titulo: 'Data e hora', largura: 17 }, { titulo: 'Colaborador', largura: 34 },
    { titulo: 'Setor', largura: 32 }, { titulo: 'Batida', largura: 10 }, { titulo: 'Distância do local', largura: 14 },
    { titulo: 'Quem registrou', largura: 26 }, { titulo: 'Endereço aproximado', largura: 40 }, { titulo: 'Mapa', largura: 40 },
  ]
  ws.columns = colunas.map(c => ({ width: c.largura }))
  adicionarLogoNaAba(wb, ws, await carregarLogoBuffer())
  ws.mergeCells(2, 1, 2, colunas.length)
  const t = ws.getCell(2, 1)
  t.value = `BATIDAS FORA DO LOCAL — ${eventoNome.toUpperCase()} — ${recorte.toUpperCase()}`
  t.font = { bold: true, size: 14, color: { argb: BRANCO } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_MARCA } }
  ws.getRow(2).height = 26
  ws.mergeCells(3, 1, 3, colunas.length)
  const info = ws.getCell(3, 1)
  info.value = `${linhas.length} registro(s). Raio do local: ${raioM ?? '—'} m. Gerado em ${formatarBR(new Date().toISOString(), 'completo')}`
  info.font = { italic: true, size: 9, color: { argb: COR_TEXTO } }
  const cab = 5
  colunas.forEach((c, i) => {
    const cel = ws.getCell(cab, i + 1)
    cel.value = c.titulo
    cel.font = { bold: true, color: { argb: BRANCO }, size: 10 }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ACENTO } }
    cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cel.border = BORDA_CELULA
  })
  linhas.forEach((l, idx) => {
    const mapa = linkMapa(l)
    const valores: (string | Date | { text: string; hyperlink: string })[] = [
      l.situacao === 'registrada' ? 'Registrada' : 'Recusada', new Date(l.quando), l.funcionarioNome, l.setorNome ?? '—',
      l.tipo ? ROTULO_TIPO[l.tipo] : '—', distancia(l.distanciaM), l.quemRegistrou, l.endereco ?? '',
      mapa ? { text: 'Abrir no mapa', hyperlink: mapa } : '',
    ]
    valores.forEach((v, i) => {
      const cel = ws.getCell(cab + 1 + idx, i + 1)
      cel.value = v
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: [2, 3, 6, 7].includes(i) ? 'left' : 'center', wrapText: i === 7 }
      if (v instanceof Date) cel.numFmt = 'dd/mm/yyyy hh:mm'
      if (idx % 2 === 1) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } }
    })
  })
  ws.views = [{ state: 'frozen', ySplit: cab }]
  if (linhas.length) ws.autoFilter = { from: { row: cab, column: 1 }, to: { row: cab + linhas.length, column: colunas.length } }
  const buffer = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `fora-do-local-${`${eventoNome}-${recorte}`.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

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
          onClick={async () => { setBaixando(true); try { await baixarPlanilha(filtradas, eventoNome, relatorio.raioM, nomeRecorte) } finally { setBaixando(false) } }}
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
