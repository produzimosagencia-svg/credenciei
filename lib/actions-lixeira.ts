'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { ehMaster } from './permissions'
import { registrarAuditoria } from './auditoria'
import { mensagemAmigavel } from './erros'
import { formatCpf } from './format'
import { sincronizarAgendamentos } from './mensagens'
import { TABELAS_DA_PESSOA } from './lixeira'

/**
 * Restaura uma pessoa excluída — SÓ o master (decisão do Juan, 08/10/2026).
 *
 * A pessoa volta com o MESMO id e o MESMO token do QR, no mesmo setor, com as batidas, os dias de trabalho e a
 * biometria que tinha. O link da credencial que ela recebeu no WhatsApp volta a funcionar.
 *
 * Recusa (sem mexer em nada) quando o setor não existe mais ou quando o CPF já foi cadastrado de novo no evento —
 * aí são duas pessoas para o mesmo CPF, e quem decide qual fica é o master, na tela do setor.
 *
 * Devolve `{ ok }` / `{ erro }` e nunca lança (o Next esconde a mensagem de exceção em produção).
 */
export async function restaurarExcluido(lixeiraId: string): Promise<{ ok: true; nome: string; avisos: string[] } | { erro: string }> {
  try {
    const perfil = await getPerfil()
    if (!perfil || !ehMaster(perfil.role)) return { erro: 'Só o master restaura pessoas excluídas.' }

    const { data: copia, error: erroCopia } = await supabaseAdmin
      .from('funcionarios_excluidos').select('*').eq('id', lixeiraId).maybeSingle()
    if (erroCopia) return { erro: 'Falta rodar a atualização do banco (upgrade-lixeira-funcionarios.sql).' }
    if (!copia) return { erro: 'Registro não encontrado na lixeira.' }
    if (copia.restaurado_em) return { erro: 'Esta pessoa já foi restaurada.' }

    const dados = copia.dados as Record<string, unknown>
    const fornecedorId = dados.fornecedor_id as string | null
    const { data: setor } = fornecedorId
      ? await supabaseAdmin.from('fornecedores').select('id, nome, evento_id').eq('id', fornecedorId).maybeSingle()
      : { data: null }
    if (!setor) return { erro: `O setor "${copia.fornecedor_nome ?? ''}" não existe mais. Recadastre a pessoa em outro setor.` }

    // O mesmo CPF já voltou a este evento (recadastro)? Dois cadastros para o mesmo CPF não pode.
    const { data: jaTem } = await supabaseAdmin
      .from('funcionarios').select('id, fornecedores!inner(nome, evento_id)')
      .eq('cpf', copia.cpf as string).eq('fornecedores.evento_id', setor.evento_id as string).limit(1)
    if (jaTem?.length) {
      const onde = (jaTem[0].fornecedores as unknown as { nome: string } | null)?.nome ?? 'outro setor'
      return { erro: `${copia.nome} já tem um cadastro novo neste evento (setor ${onde}). Exclua o cadastro novo antes de restaurar o antigo, ou mantenha o novo.` }
    }

    const { error: erroVolta } = await supabaseAdmin.from('funcionarios').insert(dados)
    if (erroVolta) return { erro: `Não foi possível restaurar: ${mensagemAmigavel(erroVolta)}` }

    // O que estava pendurado na pessoa. Uma tabela que falhar não desfaz o resto — vira aviso.
    const avisos: string[] = []
    const relacionados = (copia.relacionados ?? {}) as Record<string, Record<string, unknown>[]>
    for (const tabela of TABELAS_DA_PESSOA) {
      const linhas = relacionados[tabela]
      if (!linhas?.length) continue
      const { error } = await supabaseAdmin.from(tabela).insert(linhas)
      if (error) avisos.push(`${tabela}: ${error.message}`)
    }

    await supabaseAdmin.from('funcionarios_excluidos')
      .update({ restaurado_em: new Date().toISOString(), restaurado_por_nome: perfil.nome }).eq('id', lixeiraId)

    const eventoId = setor.evento_id as string
    after(() => registrarAuditoria({
      perfil, acao: 'RESTAURACAO_FUNCIONARIO', campoAlterado: 'Funcionário restaurado da lixeira',
      valorNovo: `${copia.nome} — CPF ${formatCpf(copia.cpf as string)} (${setor.nome})`,
      funcionarioId: dados.id as string, eventoId,
    }))
    // Os lembretes de WhatsApp foram apagados junto: a fila refaz os desta pessoa.
    after(() => sincronizarAgendamentos(eventoId).catch(console.error))

    revalidatePath('/admin/excluidos')
    revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${setor.id}`)
    return { ok: true, nome: copia.nome as string, avisos }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}
