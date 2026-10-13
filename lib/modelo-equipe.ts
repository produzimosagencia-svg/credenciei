import 'server-only'
import * as XLSX from 'xlsx'
import { eventoUsaEscalaPorDia, diasDaEscalaDoEvento } from './escala'
import { rotuloDoDia, ROTULO_FASE } from './escala-regras'

/**
 * O MODELO da planilha de equipe (pedido do Juan, 09/10/2026): Nome, CPF, Telefone, Cargo, Cidade, Chave PIX e, em
 * evento com escala por dia, UMA COLUNA POR DIA DO EVENTO. Os nomes batem com o que `lerPlanilhaDeEquipe`
 * (lib/planilha.ts) reconhece. Usado na tela da equipe (app/api/import/modelo) e no link público do pedido de setor
 * (app/pedido-setor/[token]/modelo), onde o fornecedor ainda não tem setor — aí sai sem o nome dele.
 */
export async function montarModeloDeEquipe(p: { eventoId: string; eventoNome: string; setorNome: string | null }): Promise<Buffer> {
  const eventoId = p.eventoId
  const usaEscala = await eventoUsaEscalaPorDia(eventoId)
  const todosOsDias = usaEscala ? await diasDaEscalaDoEvento(eventoId) : []
  // TODOS os dias do evento (Juan: "10 dias no evento, então vai ser 10 colunas").
  const dias = todosOsDias
  const colunasDeDia = dias.map(d => {
    const r = rotuloDoDia(d.data)
    return `${r.curto} ${r.semanaCurta} · ${ROTULO_FASE[d.fase]}`
  })

  const cabecalho = ['Nome', 'CPF', 'Telefone', 'Cargo', 'Cidade', 'Chave PIX', ...colunasDeDia]
  const equipe = XLSX.utils.aoa_to_sheet([cabecalho])
  equipe['!cols'] = cabecalho.map((c, i) => ({ wch: i < 6 ? [34, 16, 18, 20, 20, 26][i] : Math.max(16, c.length + 2) }))

  const instrucoes = [
    ['Como preencher'],
    [''],
    [`Evento: ${p.eventoNome}`],
    ...(p.setorNome ? [[`Fornecedor: ${p.setorNome}`]] : []),
    [''],
    ['Uma pessoa por linha, na aba "Equipe".'],
    ['Nome, CPF, Telefone (com DDD — é por ele que a credencial chega no WhatsApp) e Cidade: obrigatórios. Cargo e Chave PIX: opcionais.'],
    ...(colunasDeDia.length
      ? [
          [''],
          ['DIAS DE TRABALHO — uma coluna para cada dia do evento:'],
          ['   X ou SIM na coluna do dia = a pessoa trabalha nesse dia.'],
          ['   Vazio = não trabalha nesse dia.'],
          ['   Todas as colunas marcadas = trabalha todos os dias.'],
          ['Quem ficar sem nenhum dia marcado não é importado. Os dias marcados entram já aprovados, respeitando o limite de pessoas por dia do setor.'],
        ]
      : []),
    [''],
    ['Não mude o nome das colunas e não deixe linha de exemplo: toda linha com nome é cadastrada.'],
    [''],
    ['COMO ENVIAR: depois que o pedido do fornecedor for aprovado, o supervisor recebe o acesso no WhatsApp, entra no Credenciei, abre a equipe dele e usa "Importar planilha" com este arquivo preenchido. Cada pessoa cadastrada recebe a própria credencial no WhatsApp.'],
  ]
  const comoPreencher = XLSX.utils.aoa_to_sheet(instrucoes)
  comoPreencher['!cols'] = [{ wch: 110 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, equipe, 'Equipe')
  XLSX.utils.book_append_sheet(wb, comoPreencher, 'Como preencher')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/** "modelo-equipe-seguranca.xlsx" — sem acento nem espaço. */
export function nomeDoArquivoModelo(nome: string): string {
  return `modelo-equipe-${nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'setor'}.xlsx`
}
