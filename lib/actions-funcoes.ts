'use server'
import { cookies } from 'next/headers'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getPerfil } from './supabase-server'
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
export async function trocarFuncao(role: string): Promise<{ ok: true; destino: string } | { erro: string }> {
  try {
    const perfil = await getPerfil()
    if (!perfil) return { erro: 'Sessão expirada. Entre de novo.' }
    const funcoes = (perfil.funcoes ?? []) as FuncaoDoPerfil[]
    if (!funcoes.some(f => f.role === role)) return { erro: 'Você não tem este perfil.' }

    ;(await cookies()).set(COOKIE_FUNCAO, role, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      path: '/', maxAge: 60 * 60 * 24 * 30,
    })
    after(() => registrarAuditoria({
      perfil: { id: perfil.id as string, nome: perfil.nome as string },
      acao: 'TROCA_DE_PERFIL', campoAlterado: 'Perfil em uso',
      valorAnterior: ROLE_LABELS[perfil.role as Role] ?? (perfil.role as string),
      valorNovo: ROLE_LABELS[role as Role] ?? role,
      organizacaoId: (perfil.organizacao_id as string | null) ?? undefined,
    }))
    revalidatePath('/', 'layout')
    return { ok: true, destino: destinoDaFuncao(role) }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Não foi possível trocar de perfil.' }
  }
}
