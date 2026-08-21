/**
 * Nome de usuário do supervisor.
 *
 * O supervisor entra com um NOME DE USUÁRIO ("juan.bar"), não com e-mail. O
 * motivo é prático: quem trabalha no portão de um evento muitas vezes não tem
 * e-mail à mão, e o organizador acabava inventando um endereço qualquer — que
 * precisava ser único no sistema inteiro e travava o cadastro na hora errada.
 *
 * Por baixo, o Supabase Auth só sabe autenticar por e-mail. Então o nome de
 * usuário vira um endereço interno num domínio reservado, que nunca recebe
 * mensagem e não pertence a ninguém. A pessoa não vê esse endereço: ela recebe
 * o nome de usuário pelo WhatsApp e digita só isso na tela de login.
 *
 * Admin e master continuam com e-mail de verdade — eles recebem comunicação e
 * precisam de recuperação de senha.
 */

/** Domínio interno. Não existe fora do banco de autenticação. */
export const DOMINIO_INTERNO = 'supervisor.credenciei'

/** Letras, números, ponto, hífen e sublinhado. Nada de espaço nem acento. */
const VALIDO = /^[a-z0-9._-]{3,32}$/

/**
 * Normaliza o que a pessoa digitou: minúsculas, sem acento, espaço vira ponto.
 * "João Bar" → "joao.bar". Aceitar a digitação natural evita que o organizador
 * precise saber a regra antes de escrever.
 */
export function normalizarUsuario(bruto: string): string {
  return (bruto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // tira acento
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\-_]+|[.\-_]+$/g, '')
}

/** Mensagem de erro, ou null quando está válido. */
export function validarUsuario(usuario: string): string | null {
  if (!usuario) return 'Informe o nome de usuário do supervisor.'
  if (usuario.length < 3) return 'O nome de usuário precisa ter ao menos 3 caracteres.'
  if (usuario.length > 32) return 'O nome de usuário é muito longo (máximo 32 caracteres).'
  if (!VALIDO.test(usuario)) return 'Use apenas letras, números, ponto, hífen ou sublinhado.'
  return null
}

/** "juan.bar" → "juan.bar@supervisor.credenciei" */
export function usuarioParaEmail(usuario: string): string {
  return `${usuario}@${DOMINIO_INTERNO}`
}

/** O contrário. Devolve null quando o e-mail é de verdade (admin/master). */
export function emailParaUsuario(email: string | null | undefined): string | null {
  const e = (email ?? '').trim().toLowerCase()
  const sufixo = `@${DOMINIO_INTERNO}`
  return e.endsWith(sufixo) ? e.slice(0, -sufixo.length) : null
}

/**
 * O que mandar pro Supabase no login.
 *
 * Sem "@", é nome de usuário de supervisor e vira o endereço interno. Com
 * "@", é e-mail de admin/master e passa direto. Assim a MESMA tela de login
 * atende os dois, sem a pessoa precisar escolher um tipo de conta.
 */
export function identificadorParaEmail(digitado: string): string {
  const v = (digitado ?? '').trim()
  return v.includes('@') ? v.toLowerCase() : usuarioParaEmail(normalizarUsuario(v))
}

/** Como o identificador aparece na interface: usuário puro ou e-mail real. */
export function exibirIdentificador(email: string | null | undefined): string {
  return emailParaUsuario(email) ?? (email ?? '')
}
