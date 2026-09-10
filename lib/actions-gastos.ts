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
