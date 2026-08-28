/**
 * Identificação do supervisor no login.
 *
 * O supervisor entra com o CPF, não com e-mail nem nome de usuário. Já foi
 * e-mail (o organizador inventava um endereço qualquer) e já foi nome de
 * usuário ("joao.bar" — que o organizador precisava lembrar ter criado e o
 * supervisor precisava decorar). O CPF resolve os dois lados: a pessoa sabe o
 * dela de cor e ninguém precisa inventar nada.
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

/** A senha de todo supervisor. Decisão do cliente — ver upgrade-supervisor-cpf.sql. */
export const SENHA_PADRAO_SUPERVISOR = '123456'

/** Só os dígitos. "123.456.789-00" e "12345678900" viram a mesma coisa. */
export function normalizarCpf(bruto: string): string {
  return (bruto ?? '').replace(/\D/g, '')
}

/** É um CPF (11 dígitos) e não um nome de usuário? */
export function pareceCpf(bruto: string): boolean {
  return normalizarCpf(bruto).length === 11
}

/**
 * "123.456.789-00" → "12345678900@supervisor.credenciei"
 *
 * O e-mail interno usa só os dígitos: assim tanto faz o supervisor digitar com
 * ponto e traço ou sem, e os dois caem na mesma conta.
 */
export function cpfParaEmail(cpf: string): string {
  return `${normalizarCpf(cpf)}@${DOMINIO_INTERNO}`
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
  // Com "@" é e-mail de admin/master.
  if (v.includes('@')) return v.toLowerCase()
  // Só dígitos e 11 deles: CPF de supervisor, o formato atual.
  if (pareceCpf(v)) return cpfParaEmail(v)
  // Sobrou o nome de usuário do formato anterior. Continua valendo para quem
  // foi cadastrado antes da troca — tirar isso trancaria supervisores que já
  // existem para fora do sistema, sem aviso.
  return usuarioParaEmail(normalizarUsuario(v))
}

/** Como o identificador aparece na interface: usuário puro ou e-mail real. */
export function exibirIdentificador(email: string | null | undefined): string {
  return emailParaUsuario(email) ?? (email ?? '')
}
