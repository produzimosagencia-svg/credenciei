import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { supabaseAdmin } from './supabase-server'

const PREFIXO = 'convite_senha_supervisor:'
const VALIDADE_MS = 24 * 60 * 60 * 1000

type EstadoConvite = {
  perfil_id: string
  nome: string
  /* O CPF viaja no convite para a tela poder DIZER qual é o login.
     Sem ele, a pessoa cria a senha e vai para o login sem saber o que
     digitar no primeiro campo — que foi exatamente o que aconteceu. */
  cpf?: string
  evento_id: string
  evento: string
  setor: string
  expira_em: string
  usado_em: string | null
}

export type ConviteSupervisorPublico = {
  valido: boolean
  nome?: string
  /** Já formatado para leitura: 123.456.789-00. É o login da pessoa. */
  cpf?: string
  evento?: string
  setor?: string
  motivo?: 'invalido' | 'expirado' | 'usado'
}

/** "12345678900" → "123.456.789-00". Vazio quando o convite é antigo. */
function formatarCpf(bruto: string | undefined): string | undefined {
  const d = (bruto ?? '').replace(/\D/g, '')
  if (d.length !== 11) return undefined
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function chaveDoToken(token: string): string | null {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null
  return `${PREFIXO}${hashToken(token)}`
}

async function buscarEstado(token: string): Promise<{ chave: string; estado: EstadoConvite } | null> {
  const chave = chaveDoToken(token)
  if (!chave) return null
  const { data } = await supabaseAdmin
    .from('sistema_estado')
    .select('valor')
    .eq('chave', chave)
    .maybeSingle()
  if (!data?.valor) return null
  return { chave, estado: data.valor as EstadoConvite }
}

/** Cria um segredo de uso único; o banco recebe somente o SHA-256 dele. */
export async function criarConviteSenhaSupervisor(params: {
  perfilId: string
  nome: string
  cpf?: string
  eventoId: string
  evento: string
  setor: string
}): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const chave = `${PREFIXO}${hashToken(token)}`
  const estado: EstadoConvite = {
    perfil_id: params.perfilId,
    nome: params.nome,
    cpf: params.cpf,
    evento_id: params.eventoId,
    evento: params.evento,
    setor: params.setor,
    expira_em: new Date(Date.now() + VALIDADE_MS).toISOString(),
    usado_em: null,
  }
  const { error } = await supabaseAdmin.from('sistema_estado').insert({ chave, valor: estado })
  if (error) throw new Error(`Não foi possível criar o convite de senha: ${error.message}`)

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app').replace(/\/$/, '')
  return `${site}/supervisor/criar-senha/${token}`
}

export async function consultarConviteSenhaSupervisor(token: string): Promise<ConviteSupervisorPublico> {
  const convite = await buscarEstado(token)
  if (!convite) return { valido: false, motivo: 'invalido' }
  if (convite.estado.usado_em) return { valido: false, motivo: 'usado' }
  if (new Date(convite.estado.expira_em).getTime() <= Date.now()) {
    return { valido: false, motivo: 'expirado' }
  }
  return {
    valido: true,
    nome: convite.estado.nome,
    cpf: formatarCpf(convite.estado.cpf),
    evento: convite.estado.evento,
    setor: convite.estado.setor,
  }
}

/** Valida o convite novamente no servidor, altera a senha e inutiliza o link. */
export async function definirSenhaComConvite(token: string, senha: string): Promise<void> {
  const convite = await buscarEstado(token)
  if (!convite) throw new Error('Este link não é válido.')
  if (convite.estado.usado_em) throw new Error('Este link já foi utilizado.')
  if (new Date(convite.estado.expira_em).getTime() <= Date.now()) {
    throw new Error('Este link expirou. Peça um novo convite ao responsável pelo evento.')
  }

  // Reserva o convite antes da troca. A condição no JSON impede dois envios
  // simultâneos do mesmo formulário de alterarem a senha duas vezes.
  const usadoEm = new Date().toISOString()
  const reservado = { ...convite.estado, usado_em: usadoEm }
  const { data: reserva, error: erroReserva } = await supabaseAdmin
    .from('sistema_estado')
    .update({ valor: reservado, atualizado_em: usadoEm })
    .eq('chave', convite.chave)
    .is('valor->>usado_em', null)
    .select('chave')
    .maybeSingle()
  if (erroReserva || !reserva) throw new Error('Este link já foi utilizado.')

  const { error } = await supabaseAdmin.auth.admin.updateUserById(convite.estado.perfil_id, {
    password: senha,
  })
  if (error) {
    // Libera para nova tentativa se o provedor de autenticação falhar.
    await supabaseAdmin
      .from('sistema_estado')
      .update({ valor: convite.estado, atualizado_em: new Date().toISOString() })
      .eq('chave', convite.chave)
      .eq('valor->>usado_em', usadoEm)
    throw new Error('Não foi possível salvar a senha agora. Tente novamente.')
  }
}
