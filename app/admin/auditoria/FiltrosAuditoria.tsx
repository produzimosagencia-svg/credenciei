'use client'
import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { FileDown, X, AlertCircle } from 'lucide-react'
import { obterAuditoria, type LinhaAuditoria } from '@/lib/actions'
import { ACAO_LABELS } from '@/lib/auditoria-rotulos'
import { ROLE_LABELS, type Role } from '@/lib/permissions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { mensagemAmigavel } from '@/lib/erros'
import SeletorLista from '@/components/SeletorLista'

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
  const temFiltro = !!(evento || autor || setor || acao)

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
    const novo = new URLSearchParams()
    const dias = params.get('dias')
    if (dias) novo.set('dias', dias)
    router.push(novo.toString() ? `${pathname}?${novo.toString()}` : pathname)
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
      })
      if (!linhas.length) {
        setErro('Nada para exportar neste recorte.')
        return
      }
      await baixarPlanilha(linhas, nomeDoArquivo({ evento, autor, setor, acao, periodoDias, opcoes }))
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
  evento, autor, setor, acao, periodoDias, opcoes,
}: {
  evento: string; autor: string; setor: string; acao: string; periodoDias: number; opcoes: OpcoesFiltro
}): string {
  const partes = ['Auditoria']
  const doEvento = opcoes.eventos.find(e => e.id === evento)
  if (doEvento) partes.push(doEvento.nome)
  const quem = opcoes.autores.find(a => a.id === autor)
  if (quem) partes.push(quem.nome)
  if (setor) partes.push(setor)
  if (acao) partes.push(ACAO_LABELS[acao] ?? acao)
  partes.push(periodoDias === 0 ? 'tudo' : `${periodoDias}d`)
  return partes.join(' - ').replace(/[\\/:*?"<>|]/g, '').slice(0, 120)
}

async function baixarPlanilha(linhas: LinhaAuditoria[], nomeArquivo: string) {
  // `xlsx` é pesado e só serve neste clique — carregado sob demanda pra não
  // entrar no bundle de quem só está lendo a tela.
  const XLSX = await import('xlsx')

  const dados = linhas.map(l => ({
    'Data e hora': formatarBR(l.criadoEm, 'completo'),
    'Ação': ACAO_LABELS[l.acao] ?? l.acao,
    'Detalhe': l.campoAlterado ?? '',
    'Pessoa afetada': l.funcionarioNome ?? '',
    'CPF': l.funcionarioCpf ? formatCpf(l.funcionarioCpf) : '',
    'Setor da pessoa': l.funcionarioSetor ?? '',
    'De': l.valorAnterior ?? '',
    'Para': l.valorNovo ?? '',
    'Motivo': l.motivo ?? '',
    'Quem fez': l.usuarioResponsavel,
    'Tipo de acesso': l.autorRole ? (ROLE_LABELS[l.autorRole as Role] ?? l.autorRole) : '',
    'Setor de quem fez': l.autorSetor ?? '',
    'Evento': l.eventoNome ?? '',
    'IP': l.ip ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(dados)
  ws['!cols'] = [
    { wch: 18 }, { wch: 22 }, { wch: 26 }, { wch: 28 }, { wch: 16 }, { wch: 18 },
    { wch: 28 }, { wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 18 },
    { wch: 28 }, { wch: 16 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Auditoria')
  XLSX.writeFile(wb, `${nomeArquivo}.xlsx`)
}
