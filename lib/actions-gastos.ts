'use server'
import { revalidatePath } from 'next/cache'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { podeRegistrarGastos } from './permissions'
import { mensagemAmigavel } from './erros'
import { diaBRT } from './janelas'
import { CATEGORIAS_GASTO, CATEGORIA_PADRAO } from './gastos-constantes'

/**
 * Escrita no módulo Gastos.
 *
 * TODA AÇÃO DEVOLVE `{ ok }` / `{ ok: false, erro }`, NENHUMA LANÇA. Em
 * produção o Next mascara qualquer exceção que sai de uma Server Action — o
 * navegador recebe "An error occurred in the Server Components render…" e a
 * mensagem escrita se perde. Foi o que travou o relatório de WhatsApp e o
 * cadastro do Backlog por dias (09/09/2026). Valor devolvido não passa por
 * essa máscara. E nada de `export type { X }` neste arquivo — re-export de
 * tipo em módulo `'use server'` mata o módulo inteiro no runtime deste fork
 * (ver testes/coerencia.mjs, grupo 9).
 */

export type ResultadoGasto =
  | { ok: true; id?: string }
  | { ok: false; erro: string }

const SEM_ACESSO = 'Você não tem acesso ao módulo de Gastos. Fale com o administrador.'

async function exigirGastos() {
  const perfil = await getPerfil()
  if (!perfil || !podeRegistrarGastos(perfil)) return null
  return perfil
}

const TIPOS_ANEXO = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'])

/** Sobe o comprovante no bucket `gastos`. Devolve null se não veio arquivo. */
async function subirComprovante(
  eventoId: string, arquivo: FormDataEntryValue | null,
): Promise<{ path: string; nome: string } | null> {
  if (!(arquivo instanceof File) || arquivo.size === 0) return null
  if (!TIPOS_ANEXO.has(arquivo.type)) {
    throw new Error('Formato não aceito. Envie uma imagem (JPG, PNG, WEBP) ou um PDF.')
  }
  if (arquivo.size > 10 * 1024 * 1024) throw new Error('Arquivo muito grande. O limite é 10MB.')
  const path = `${eventoId}/${Date.now()}-${arquivo.name.replace(/[^\w.\-]/g, '_')}`
  const buffer = Buffer.from(await arquivo.arrayBuffer())
  const { error } = await supabaseAdmin.storage.from('gastos').upload(path, buffer, { contentType: arquivo.type })
  if (error) throw new Error('Erro ao enviar o comprovante. Tente de novo.')
  return { path, nome: arquivo.name }
}

function parseValor(bruto: FormDataEntryValue | null): number {
  const n = Number(String(bruto ?? '').replace(/\s/g, '').replace('.', '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) throw new Error('Informe um valor válido, maior que zero.')
  return Math.round(n * 100) / 100
}

function limpar(v: FormDataEntryValue | null): string | null {
  const t = String(v ?? '').trim()
  return t || null
}

/**
 * Os campos comuns a criar e editar, já validados. Lança `Error` de mensagem
 * própria — quem chama embrulha num try/catch e devolve `{ ok: false }`.
 */
function camposDoFormulario(formData: FormData) {
  const descricao = String(formData.get('descricao') ?? '').trim()
  if (!descricao) throw new Error('Diga o que foi o gasto.')

  const valor = parseValor(formData.get('valor'))

  const categoriaBruta = String(formData.get('categoria') ?? '').trim()
  const categoria = CATEGORIAS_GASTO.includes(categoriaBruta as (typeof CATEGORIAS_GASTO)[number])
    ? categoriaBruta
    : CATEGORIA_PADRAO

  const dataBruta = String(formData.get('data_gasto') ?? '').trim()
  const dataGasto = /^\d{4}-\d{2}-\d{2}$/.test(dataBruta) ? dataBruta : diaBRT()

  return {
    descricao,
    valor,
    categoria,
    data_gasto: dataGasto,
    fornecedor: limpar(formData.get('fornecedor')),
    forma_pagamento: limpar(formData.get('forma_pagamento')),
    observacao: limpar(formData.get('observacao')),
  }
}

// ─── Criar ───────────────────────────────────────────────────────────────────

export async function criarGasto(formData: FormData): Promise<ResultadoGasto> {
  try {
    const perfil = await exigirGastos()
    if (!perfil) return { ok: false, erro: SEM_ACESSO }

    const eventoId = String(formData.get('evento_id') ?? '').trim()
    if (!eventoId) return { ok: false, erro: 'Escolha o evento antes de salvar o gasto.' }

    // O evento tem que existir E estar no escopo deste perfil — não basta o
    // id vir preenchido, ele é digitável na chamada direta.
    const { eventosParaGastos } = await import('./gastos')
    const permitidos = await eventosParaGastos()
    if (!permitidos.some(e => e.id === eventoId)) {
      return { ok: false, erro: 'Esse evento não está disponível pra você.' }
    }

    const campos = camposDoFormulario(formData)
    const origem = String(formData.get('origem') ?? 'manual')
    const transcricao = origem === 'audio' ? limpar(formData.get('transcricao')) : null

    const { data, error } = await supabaseAdmin.from('gastos_evento').insert({
      ...campos,
      evento_id: eventoId,
      origem: origem === 'audio' ? 'audio' : 'manual',
      status: 'confirmado',
      transcricao,
      criado_por: perfil.id,
    }).select('id').single()
    if (error) {
      console.error('[gastos] insert recusado', { erro: error.message, codigo: error.code })
      return { ok: false, erro: `Não consegui salvar: ${error.message}` }
    }

    // Comprovante depois do insert: se o upload falhar (formato, rede), o
    // gasto não some por causa da foto do recibo — dá pra anexar depois.
    try {
      const comp = await subirComprovante(eventoId, formData.get('comprovante'))
      if (comp) {
        await supabaseAdmin.from('gastos_evento')
          .update({ comprovante_path: comp.path, comprovante_nome: comp.nome })
          .eq('id', data.id)
      }
    } catch (e) {
      console.error('[gastos] comprovante não subiu', { gastoId: data.id, erro: e instanceof Error ? e.message : e })
    }

    atualizarTelas(eventoId)
    return { ok: true, id: data.id as string }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

// ─── Editar ──────────────────────────────────────────────────────────────────

export async function editarGasto(id: string, formData: FormData): Promise<ResultadoGasto> {
  try {
    const perfil = await exigirGastos()
    if (!perfil) return { ok: false, erro: SEM_ACESSO }

    const { data: atual } = await supabaseAdmin
      .from('gastos_evento').select('id, evento_id, comprovante_path').eq('id', id).maybeSingle()
    if (!atual) return { ok: false, erro: 'Este gasto não existe mais.' }

    const campos = camposDoFormulario(formData)

    let novoComprovante: { path: string; nome: string } | null = null
    try {
      novoComprovante = await subirComprovante(atual.evento_id as string, formData.get('comprovante'))
    } catch (e) {
      console.error('[gastos] comprovante novo não subiu', { gastoId: id, erro: e instanceof Error ? e.message : e })
    }

    const { error } = await supabaseAdmin.from('gastos_evento').update({
      ...campos,
      atualizado_em: new Date().toISOString(),
      ...(novoComprovante ? { comprovante_path: novoComprovante.path, comprovante_nome: novoComprovante.nome } : {}),
    }).eq('id', id)
    if (error) return { ok: false, erro: `Não consegui salvar: ${error.message}` }

    if (novoComprovante && atual.comprovante_path) {
      await supabaseAdmin.storage.from('gastos').remove([atual.comprovante_path as string])
    }

    atualizarTelas(atual.evento_id as string)
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

// ─── Excluir ─────────────────────────────────────────────────────────────────

export async function excluirGasto(id: string): Promise<ResultadoGasto> {
  try {
    const perfil = await exigirGastos()
    if (!perfil) return { ok: false, erro: SEM_ACESSO }

    const { data: atual } = await supabaseAdmin
      .from('gastos_evento').select('id, evento_id, comprovante_path').eq('id', id).maybeSingle()
    if (!atual) return { ok: false, erro: 'Este gasto já não existe.' }

    const { error } = await supabaseAdmin.from('gastos_evento').delete().eq('id', id)
    if (error) return { ok: false, erro: `Não consegui excluir: ${error.message}` }

    if (atual.comprovante_path) {
      await supabaseAdmin.storage.from('gastos').remove([atual.comprovante_path as string])
    }

    atualizarTelas(atual.evento_id as string)
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

// ─── Comprovante ─────────────────────────────────────────────────────────────

/**
 * URL assinada do comprovante — gerada na hora, curta. O caminho vem de uma
 * consulta aqui dentro pelo ID, nunca do que o cliente mandou.
 */
export async function urlComprovanteGasto(id: string): Promise<{ ok: true; url: string | null } | { ok: false; erro: string }> {
  const perfil = await exigirGastos()
  if (!perfil) return { ok: false, erro: SEM_ACESSO }
  const { data } = await supabaseAdmin.from('gastos_evento').select('comprovante_path').eq('id', id).maybeSingle()
  if (!data?.comprovante_path) return { ok: true, url: null }
  const { data: assinada } = await supabaseAdmin.storage.from('gastos').createSignedUrl(data.comprovante_path as string, 60 * 15)
  return { ok: true, url: assinada?.signedUrl ?? null }
}

function atualizarTelas(eventoId: string) {
  revalidatePath('/gastos')
  revalidatePath('/gastos/lista')
  revalidatePath('/gastos/painel')
  if (eventoId) revalidatePath(`/gastos?evento=${eventoId}`)
}

// ─── Exportação pra Excel, com a identidade do Credenciei ────────────────────

const LARANJA = 'FFFF4A0F'
const LARANJA_CLARO = 'FFFFF1EA'
const BRANCO = 'FFFFFFFF'
const CINZA = 'FF57534E'

/**
 * A planilha .xlsx do recorte atual — com cara de Credenciei: faixa laranja
 * no topo, cabeçalho de coluna laranja, valores em R$, linha de TOTAL, e o
 * bloco de informação do evento + data de geração.
 *
 * Roda no servidor (ExcelJS é pesado pro bundle do cliente) e devolve o
 * arquivo em base64. Reconsulta com o mesmo filtro — não recebe a lista.
 */
export async function exportarGastosXlsx(filtro: {
  eventoId: string; categoria?: string; fornecedor?: string; de?: string; ate?: string
}): Promise<{ ok: true; base64: string; nome: string } | { ok: false; erro: string }> {
  try {
    const perfil = await exigirGastos()
    if (!perfil) return { ok: false, erro: SEM_ACESSO }

    const { eventosParaGastos, listarGastos } = await import('./gastos')
    const permitidos = await eventosParaGastos()
    const evento = permitidos.find(e => e.id === filtro.eventoId)
    if (!evento) return { ok: false, erro: 'Esse evento não está disponível pra você.' }

    const gastos = await listarGastos({
      eventoId: filtro.eventoId,
      categoria: filtro.categoria || undefined,
      fornecedor: filtro.fornecedor || undefined,
      de: filtro.de || undefined,
      ate: filtro.ate || undefined,
    })

    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Credenciei'
    wb.created = new Date()
    const ws = wb.addWorksheet('Gastos', { views: [{ state: 'frozen', ySplit: 8 }] })

    const COLS = [
      { h: 'Data', w: 12 }, { h: 'Descrição', w: 36 }, { h: 'Categoria', w: 18 },
      { h: 'Fornecedor', w: 22 }, { h: 'Forma de pagamento', w: 20 },
      { h: 'Valor (R$)', w: 15 }, { h: 'Observação', w: 34 }, { h: 'Registrado em', w: 18 },
    ]
    ws.columns = COLS.map(c => ({ width: c.w }))
    const nCol = COLS.length

    const merge = (linha: number) => ws.mergeCells(linha, 1, linha, nCol)
    const bordaTudo = (linha: number, fina = true) => {
      for (let c = 1; c <= nCol; c++) {
        ws.getCell(linha, c).border = {
          top: { style: fina ? 'thin' : 'medium', color: { argb: 'FFE7E2DF' } },
          bottom: { style: fina ? 'thin' : 'medium', color: { argb: 'FFE7E2DF' } },
          left: { style: 'thin', color: { argb: 'FFE7E2DF' } },
          right: { style: 'thin', color: { argb: 'FFE7E2DF' } },
        }
      }
    }

    // 1 — Faixa laranja com o nome do evento
    merge(1)
    const t = ws.getCell(1, 1)
    t.value = `CREDENCIEI · GASTOS — ${evento.nome}`
    t.font = { bold: true, size: 14, color: { argb: BRANCO } }
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } }
    t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    ws.getRow(1).height = 30

    // 2-6 — Bloco de informação
    const info = (linha: number, rotulo: string, valor: string) => {
      ws.getCell(linha, 1).value = rotulo
      ws.getCell(linha, 1).font = { bold: true, color: { argb: CINZA }, size: 10 }
      ws.mergeCells(linha, 2, linha, nCol)
      ws.getCell(linha, 2).value = valor
      ws.getCell(linha, 2).font = { color: { argb: CINZA }, size: 10 }
    }
    const fmtData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
    const periodo = filtro.de || filtro.ate
      ? `${filtro.de ? fmtData(filtro.de) : '…'} a ${filtro.ate ? fmtData(filtro.ate) : '…'}`
      : 'todos os lançamentos'
    info(3, 'Evento', evento.nome)
    info(4, 'Período', periodo)
    info(5, 'Lançamentos', String(gastos.length))
    info(6, 'Gerado em', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))

    // 8 — Cabeçalho das colunas
    const LH = 8
    COLS.forEach((c, i) => {
      const cel = ws.getCell(LH, i + 1)
      cel.value = c.h
      cel.font = { bold: true, color: { argb: BRANCO }, size: 10 }
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } }
      cel.alignment = { vertical: 'middle', horizontal: i === 5 ? 'right' : 'left', wrapText: true }
    })
    ws.getRow(LH).height = 24
    bordaTudo(LH)

    // 9+ — Dados
    let linha = LH + 1
    for (const g of gastos) {
      ws.getCell(linha, 1).value = fmtData(g.dataGasto)
      ws.getCell(linha, 2).value = g.descricao
      ws.getCell(linha, 3).value = g.categoria
      ws.getCell(linha, 4).value = g.fornecedor ?? ''
      ws.getCell(linha, 5).value = g.formaPagamento ?? ''
      const v = ws.getCell(linha, 6)
      v.value = g.valor
      v.numFmt = 'R$ #,##0.00'
      v.alignment = { horizontal: 'right' }
      ws.getCell(linha, 7).value = g.observacao ?? ''
      ws.getCell(linha, 8).value = new Date(g.registradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      if ((linha - LH) % 2 === 0) {
        for (let c = 1; c <= nCol; c++) {
          ws.getCell(linha, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA_CLARO } }
        }
      }
      bordaTudo(linha)
      linha++
    }

    // Linha de TOTAL
    const total = gastos.reduce((s, g) => s + g.valor, 0)
    ws.mergeCells(linha, 1, linha, 5)
    const rot = ws.getCell(linha, 1)
    rot.value = 'TOTAL'
    rot.font = { bold: true, color: { argb: LARANJA }, size: 11 }
    rot.alignment = { horizontal: 'right', indent: 1 }
    const tv = ws.getCell(linha, 6)
    tv.value = total
    tv.numFmt = 'R$ #,##0.00'
    tv.font = { bold: true, color: { argb: LARANJA }, size: 11 }
    tv.alignment = { horizontal: 'right' }
    for (let c = 1; c <= nCol; c++) {
      ws.getCell(linha, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA_CLARO } }
    }
    bordaTudo(linha, false)

    const buf = await wb.xlsx.writeBuffer()
    const base64 = Buffer.from(buf).toString('base64')
    const nome = `gastos-${evento.nome.replace(/[^\w]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`
    return { ok: true, base64, nome }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}
