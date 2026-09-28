'use client'
import { useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { FileDown, X, AlertCircle, Search } from 'lucide-react'
import { obterAuditoria, type LinhaAuditoria } from '@/lib/actions'
import { ACAO_LABELS } from '@/lib/auditoria-rotulos'
import { ROLE_LABELS, type Role } from '@/lib/permissions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { mensagemAmigavel } from '@/lib/erros'
import SeletorLista from '@/components/SeletorLista'
import { COR_MARCA, COR_ACENTO, COR_FAIXA_CLARA, COR_TEXTO, BRANCO, BORDA_CELULA, carregarLogoBuffer, adicionarLogoNaAba } from '@/lib/marca-relatorio'

export type OpcoesFiltro = {
  autores: { id: string; nome: string; role: string; setor: string | null }[]
  eventos: { id: string; nome: string }[]
  /** `eventoId` amarra cada setor ao evento dele — é o que deixa o filtro de
   *  Setor em cascata (só os setores do evento escolhido) sem outra ida ao
   *  banco: a lista inteira já vem carregada, só filtra na hora de montar. */
  setores: { nome: string; eventoId: string }[]
}

/**
 * Os filtros da auditoria e a exportação — os dois juntos de propósito.
 *
 * O que o Juan pede da exportação é sempre uma pergunta com recorte ("tudo
 * que o Juan fez", "tudo que aconteceu no Bar", "todos os excluídos"), e não
 * o despejo do log inteiro. Então o botão de exportar leva exatamente o que
 * está filtrado na tela: o que ele vê é o que baixa, sem uma segunda tela de
 * opções pra manter em sincronia com esta.
 *
 * Os filtros vivem na URL — dá pra voltar, recarregar, e mandar pra outra
 * pessoa o link do recorte exato que se está discutindo.
 */
export default function FiltrosAuditoria({
  opcoes, periodoDias, totalNaTela,
}: {
  opcoes: OpcoesFiltro
  /** O período escolhido, pra exportação trazer o mesmo recorte da tela. */
  periodoDias: number
  totalNaTela: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const evento = params.get('evento') ?? ''
  const autor = params.get('autor') ?? ''
  const setor = params.get('setor') ?? ''
  const acao = params.get('acao') ?? ''
  const nomeUrl = params.get('nome') ?? ''
  const temFiltro = !!(evento || autor || setor || acao || nomeUrl)

  // Campo de texto livre — nome ou CPF da pessoa. `nomeCampo` é só o que
  // aparece no input; a busca (URL) só muda quando a pessoa para de digitar.
  const [nomeCampo, setNomeCampo] = useState(nomeUrl)
  const timerBusca = useRef<ReturnType<typeof setTimeout> | null>(null)

  /*
   * Setor em cascata: com evento escolhido, só os setores DAQUELE evento
   * aparecem — senão "Bar" de três clientes diferentes se misturava na
   * mesma lista, e escolher um filtrava pelos três ao mesmo tempo (o filtro
   * de setor casa por NOME, não por id).
   */
  const setoresDoEvento = evento ? opcoes.setores.filter(s => s.eventoId === evento) : opcoes.setores
  const nomesDeSetor = [...new Set(setoresDoEvento.map(s => s.nome))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const trocar = (chave: string, valor: string) => {
    const novo = new URLSearchParams(params.toString())
    if (valor) novo.set(chave, valor)
    else novo.delete(chave)
    // Trocar de evento derruba o setor escolhido: um setor de outro evento
    // não faz sentido mais — ficaria filtrando por um nome que não existe
    // dentro do evento novo.
    if (chave === 'evento') novo.delete('setor')
    router.push(`${pathname}?${novo.toString()}`)
  }

  const limpar = () => {
    if (timerBusca.current) clearTimeout(timerBusca.current)
    setNomeCampo('')
    const novo = new URLSearchParams()
    const dias = params.get('dias')
    if (dias) novo.set('dias', dias)
    router.push(novo.toString() ? `${pathname}?${novo.toString()}` : pathname)
  }

  /*
   * Nome digitado: atualiza o campo na hora (sem travar a UI), mas só manda
   * pro banco depois de 400ms sem a pessoa digitar de novo — a busca é no
   * servidor, não local como as outras telas, então filtrar a cada tecla
   * seria uma ida ao banco por letra.
   */
  const digitarNome = (valor: string) => {
    setNomeCampo(valor)
    if (timerBusca.current) clearTimeout(timerBusca.current)
    timerBusca.current = setTimeout(() => trocar('nome', valor.trim()), 400)
  }

  const exportar = async () => {
    setBaixando(true)
    setErro(null)
    try {
      /*
       * Teto próprio, bem maior que o da tela: aqui ninguém vai rolar a
       * lista — o arquivo é pra ser aberto no Excel e filtrado lá.
       */
      const linhas = await obterAuditoria({
        limite: 5000,
        dias: periodoDias,
        eventoId: evento || undefined,
        autorId: autor || undefined,
        acao: acao || undefined,
        setor: setor || undefined,
        nome: nomeUrl || undefined,
      })
      if (!linhas.length) {
        setErro('Nada para exportar neste recorte.')
        return
      }
      await baixarPlanilha(linhas, nomeDoArquivo({ evento, autor, setor, acao, periodoDias, opcoes, nome: nomeUrl }))
    } catch (e) {
      setErro(mensagemAmigavel(e))
    } finally {
      setBaixando(false)
    }
  }

  return (
    <div className="space-y-2">
      {/*
        * Ordem: Evento → Setor → Ação → Quem fez. O evento é o recorte mais
        * largo e vem primeiro; o setor depende dele e vem logo depois
        * (pedido do Juan, 09/09/2026: "Evento > Setor > Fez o que").
        */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={nomeCampo}
            onChange={e => digitarNome(e.target.value)}
            placeholder="Buscar pessoa por nome ou CPF"
            className="input pl-8 pr-7 text-sm w-full"
            autoComplete="off"
          />
          {nomeCampo && (
            <button
              onClick={() => digitarNome('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <SeletorLista
          className="w-auto text-sm"
          valor={evento}
          onChange={v => trocar('evento', v)}
          placeholder="Evento: todos"
          titulo="Evento"
          busca
          opcoes={[
            { valor: '', rotulo: 'Todos' },
            ...opcoes.eventos.map(e => ({ valor: e.id, rotulo: e.nome })),
          ]}
        />

        <SeletorLista
          className="w-auto text-sm"
          valor={setor}
          onChange={v => trocar('setor', v)}
          placeholder="Setor: todos"
          titulo="Setor"
          busca
          opcoes={[
            { valor: '', rotulo: 'Todos' },
            ...nomesDeSetor.map(s => ({ valor: s, rotulo: s })),
          ]}
        />

        <SeletorLista
          className="w-auto text-sm"
          valor={acao}
          onChange={v => trocar('acao', v)}
          placeholder="Ação: todas"
          titulo="Ação"
          busca
          opcoes={[
            { valor: '', rotulo: 'Todas' },
            ...Object.entries(ACAO_LABELS).map(([valor, label]) => ({ valor, rotulo: label })),
          ]}
        />

        <SeletorLista
          className="w-auto text-sm"
          valor={autor}
          onChange={v => trocar('autor', v)}
          placeholder="Quem fez: todos"
          titulo="Quem fez"
          busca
          opcoes={[
            { valor: '', rotulo: 'Todos' },
            ...opcoes.autores.map(a => ({
              valor: a.id,
              rotulo: a.nome,
              detalhe: `${a.setor ? `${a.setor} · ` : ''}${ROLE_LABELS[a.role as Role] ?? a.role}`,
            })),
          ]}
        />

        {temFiltro && (
          <button onClick={limpar} className="btn btn-secundario btn-sm">
            <X className="w-3.5 h-3.5" /> Limpar
          </button>
        )}

        <button
          onClick={exportar}
          disabled={baixando || !totalNaTela}
          className="btn btn-primario btn-sm ml-auto"
        >
          <FileDown className="w-3.5 h-3.5" />
          {baixando ? 'Gerando…' : 'Exportar'}
        </button>
      </div>

      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}
    </div>
  )
}

/** O nome diz o recorte — três arquivos na pasta de Downloads não se confundem. */
function nomeDoArquivo({
  evento, autor, setor, acao, periodoDias, opcoes, nome,
}: {
  evento: string; autor: string; setor: string; acao: string; periodoDias: number; opcoes: OpcoesFiltro; nome?: string
}): string {
  const partes = ['Auditoria']
  const doEvento = opcoes.eventos.find(e => e.id === evento)
  if (doEvento) partes.push(doEvento.nome)
  const quem = opcoes.autores.find(a => a.id === autor)
  if (quem) partes.push(quem.nome)
  if (setor) partes.push(setor)
  if (acao) partes.push(ACAO_LABELS[acao] ?? acao)
  if (nome) partes.push(nome)
  partes.push(periodoDias === 0 ? 'tudo' : `${periodoDias}d`)
  return partes.join(' - ').replace(/[\\/:*?"<>|]/g, '').slice(0, 120)
}

/** `wrapText: true` pras colunas que variam muito de tamanho — Detalhe, De, Para, Motivo. */
const COLUNAS_AUDITORIA = [
  { titulo: 'Data e hora', largura: 17 },
  { titulo: 'Ação', largura: 22 },
  { titulo: 'Detalhe', largura: 24, quebraLinha: true },
  { titulo: 'Pessoa afetada', largura: 22 },
  { titulo: 'CPF', largura: 15 },
  { titulo: 'Setor da pessoa', largura: 17 },
  { titulo: 'De', largura: 26, quebraLinha: true },
  { titulo: 'Para', largura: 26, quebraLinha: true },
  { titulo: 'Motivo', largura: 22, quebraLinha: true },
  { titulo: 'Quem fez', largura: 22 },
  { titulo: 'Tipo de acesso', largura: 15 },
  { titulo: 'Setor de quem fez', largura: 17 },
  { titulo: 'Evento', largura: 22 },
  { titulo: 'Entrou no evento em', largura: 17 },
  { titulo: 'IP', largura: 14 },
] as const

/**
 * Reescrito com `exceljs` (28/09/2026, reclamação real do Juan com print:
 * "ficou muito péssimo, horrível a leitura") — o `xlsx` puro usado antes só
 * escreve os valores crus, sem cabeçalho destacado, sem quebra de linha nas
 * colunas de texto mais longo (De/Para/Motivo apareciam cortados no meio) e
 * sem congelar o cabeçalho ao rolar. `exceljs` já é usado pro relatório de
 * credenciamento (`lib/relatorio-excel.ts`) — mesma paleta, mesmo padrão de
 * cabeçalho e borda, pra não ter duas identidades visuais diferentes pros
 * arquivos que este sistema exporta.
 */
async function baixarPlanilha(linhas: LinhaAuditoria[], nomeArquivo: string) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Auditoria')
  const nCol = COLUNAS_AUDITORIA.length
  ws.columns = COLUNAS_AUDITORIA.map(c => ({ width: c.largura }))

  // Linha 1 é só a logo (fundo branco) — o conteúdo de verdade começa na 2.
  adicionarLogoNaAba(wb, ws, await carregarLogoBuffer())
  let linha = 2
  ws.mergeCells(linha, 1, linha, nCol)
  const titulo = ws.getCell(linha, 1)
  titulo.value = 'AUDITORIA'
  titulo.font = { bold: true, size: 14, color: { argb: BRANCO } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_MARCA } }
  titulo.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(linha).height = 26
  linha++

  const info = ws.getCell(linha, 1)
  info.value = `${linhas.length} registro${linhas.length === 1 ? '' : 's'} — gerado em ${formatarBR(new Date().toISOString(), 'completo')}`
  info.font = { italic: true, size: 9, color: { argb: COR_TEXTO } }
  linha += 2

  const linhaCabecalho = linha
  COLUNAS_AUDITORIA.forEach((c, i) => {
    const cel = ws.getCell(linhaCabecalho, i + 1)
    cel.value = c.titulo
    cel.font = { bold: true, color: { argb: BRANCO }, size: 10 }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ACENTO } }
    cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cel.border = BORDA_CELULA
  })
  ws.getRow(linhaCabecalho).height = 26
  linha++

  linhas.forEach((l, idx) => {
    const valores: (string | number | Date | null)[] = [
      new Date(l.criadoEm),
      ACAO_LABELS[l.acao] ?? l.acao,
      l.campoAlterado ?? '',
      l.funcionarioNome ?? '',
      l.funcionarioCpf ? formatCpf(l.funcionarioCpf) : '',
      l.funcionarioSetor ?? '',
      l.valorAnterior ?? '',
      l.valorNovo ?? '',
      l.motivo ?? '',
      l.usuarioResponsavel,
      l.autorRole ? (ROLE_LABELS[l.autorRole as Role] ?? l.autorRole) : '',
      l.autorSetor ?? '',
      l.eventoNome ?? '',
      l.primeiraEntradaEm ? new Date(l.primeiraEntradaEm) : (l.acao === 'CADASTRO_FUNCIONARIO' ? 'Ainda não' : ''),
      l.ip ?? '',
    ]
    const zebra = idx % 2 === 1
    valores.forEach((v, i) => {
      const coluna = COLUNAS_AUDITORIA[i]
      const cel = ws.getCell(linha, i + 1)
      cel.value = v
      cel.border = BORDA_CELULA
      cel.alignment = {
        vertical: 'middle',
        horizontal: i === 0 || 'quebraLinha' in coluna ? 'left' : 'center',
        wrapText: 'quebraLinha' in coluna,
      }
      if (v instanceof Date) cel.numFmt = 'dd/mm/yyyy hh:mm'
      // Faixa alternada — com 15 colunas lado a lado, é o que deixa o olho
      // não perder a linha ao ler da esquerda pra direita.
      if (zebra) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } }
    })
    linha++
  })

  // Congela até o cabeçalho — rolando uma auditoria de centenas de linhas,
  // a pessoa não perde de vista o que cada coluna significa.
  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho }]
  if (linhas.length) {
    ws.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linhaCabecalho + linhas.length, column: nCol } }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nomeArquivo}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
