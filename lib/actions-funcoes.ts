'use server'
import { cookies } from 'next/headers'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { registrarAuditoria } from './auditoria'
import { COOKIE_FUNCAO, destinoDaFuncao, type FuncaoDoPerfil } from './funcoes'
import { ROLE_LABELS, type Role } from './permissions'

/**
 * Trocar de perfil — a pessoa que tem mais de uma função escolhe qual está
 * usando agora (foto do usuário → "Trocar de perfil").
 *
 * A escolha só vale se ela REALMENTE tiver a função: a lista vem do `getPerfil`
 * (base + extras do banco), nunca do que veio da tela. O cookie guarda só o
 * nome da função; mesmo adulterado, `getPerfil` ignora o que a pessoa não tem.
 * Nada lança: devolve `{ erro }` (o Next mascara exceção de Server Action).
 */
export async function trocarFuncao(chave: string): Promise<{ ok: true; destino: string } | { erro: string }> {
  try {
    const perfil = await getPerfil()
    if (!perfil) return { erro: 'Sessão expirada. Entre de novo.' }
    const funcoes = (perfil.funcoes ?? []) as FuncaoDoPerfil[]
    // `chave` = o papel, ou `operador_portao@<organização>` (Gestor em mais de uma organização).
    const escolhida = funcoes.find(f => f.chave === chave) ?? funcoes.find(f => f.role === chave)
    if (!escolhida) return { erro: 'Você não tem este perfil.' }
    const role = escolhida.role
    const rotuloNovo = ROLE_LABELS[role as Role] ?? role

    ;(await cookies()).set(COOKIE_FUNCAO, escolhida.chave, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      path: '/', maxAge: 60 * 60 * 24 * 30,
    })
    after(() => registrarAuditoria({
      perfil: { id: perfil.id as string, nome: perfil.nome as string },
      acao: 'TROCA_DE_PERFIL', campoAlterado: 'Perfil em uso',
      valorAnterior: ROLE_LABELS[perfil.role as Role] ?? (perfil.role as string),
      valorNovo: rotuloNovo,
      organizacaoId: (perfil.organizacao_id as string | null) ?? undefined,
    }))
    revalidatePath('/', 'layout')
    return { ok: true, destino: destinoDaFuncao(role) }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Não foi possível trocar de perfil.' }
  }
}

/**
 * O Gestor de credenciamento escolhe o EVENTO em que vai trabalhar — e, se o evento é de uma
 * organização onde ele também é Gestor, a função ativa passa a ser a dessa organização.
 *
 * Quem tem o papel em mais de uma organização não escolhe "organização" em lugar nenhum da tela: escolhe
 * o evento (08/10/2026), e daqui sai o contexto certo. Só vale pra evento de uma organização em que a pessoa
 * REALMENTE é Gestor — a lista vem do `getPerfil`, nunca do que veio da tela.
 */
export async function escolherEventoDoGestor(eventoId: string): Promise<{ ok: true } | { erro: string }> {
  try {
    const perfil = await getPerfil()
    if (!perfil) return { erro: 'Sessão expirada. Entre de novo.' }
    const gestor = ((perfil.funcoes ?? []) as FuncaoDoPerfil[]).filter(f => f.role === 'operador_portao')
    const { data: evento } = await supabaseAdmin.from('eventos').select('organizacao_id').eq('id', eventoId).maybeSingle()
    const funcao = evento?.organizacao_id ? gestor.find(f => f.organizacaoId === evento.organizacao_id) : undefined
    if (!funcao) return { erro: 'Você não é Gestor de credenciamento neste evento.' }
    if (funcao.chave !== perfil.funcao_chave) {
      ;(await cookies()).set(COOKIE_FUNCAO, funcao.chave, {
        httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
        path: '/', maxAge: 60 * 60 * 24 * 30,
      })
      revalidatePath('/', 'layout')
    }
    return { ok: true }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Não foi possível trocar de evento.' }
  }
}
