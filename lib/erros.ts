// Tradutor central de mensagens de erro.
//
// O sistema mostra erros vindos de três lugares: mensagens que nós mesmos
// escrevemos (já em português e prontas pro usuário), erros técnicos do
// Next/React e erros do Postgres/Supabase. Só os dois últimos precisam de
// tradução — os nossos passam direto.
//
// Regra: se a mensagem casa com algum padrão técnico conhecido, devolve a
// tradução. Se não casa com nada mas tem cara de erro técnico (inglês, stack,
// código), devolve o texto genérico. Caso contrário assume que é uma mensagem
// nossa e mostra como está.

const GENERICA = 'Não foi possível concluir a ação. Tente de novo em alguns instantes.'

const TRADUCOES: { padrao: RegExp; mensagem: string }[] = [
  // ── Rede / indisponibilidade ──────────────────────────────────────────────
  { padrao: /failed to fetch|fetch failed|networkerror|econnrefused|enotfound|socket hang up|network request failed/i,
    mensagem: 'Não conseguimos falar com o servidor. Verifique sua conexão com a internet e tente de novo.' },
  { padrao: /etimedout|timeout|timed out|504|gateway/i,
    mensagem: 'A operação demorou mais que o esperado e foi interrompida. Tente de novo.' },
  { padrao: /request entity too large|payload too large|body exceeded|413/i,
    mensagem: 'O arquivo enviado é grande demais. Use uma imagem menor e tente de novo.' },

  // ── Login e permissão ─────────────────────────────────────────────────────
  { padrao: /invalid login credentials|invalid credentials/i,
    mensagem: 'E-mail ou senha incorretos. Confira os dados e tente de novo.' },
  { padrao: /email not confirmed/i,
    mensagem: 'Este e-mail ainda não foi confirmado. Fale com o administrador para liberar o acesso.' },
  { padrao: /user already registered|already been registered|email.*already.*(exist|use)/i,
    mensagem: 'Este e-mail já está em uso. Use outro endereço de e-mail.' },
  { padrao: /password.*(short|least|weak)/i,
    mensagem: 'A senha é muito curta. Use pelo menos 6 caracteres.' },
  { padrao: /jwt|token.*expired|expired.*token|session.*expired/i,
    mensagem: 'Sua sessão expirou. Entre no sistema de novo para continuar.' },
  { padrao: /permission denied|not authorized|unauthorized|forbidden|row-level security/i,
    mensagem: 'Você não tem permissão para fazer isso. Fale com o administrador da sua organização.' },
  { padrao: /too many requests|rate limit|429/i,
    mensagem: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.' },

  // ── Banco de dados ────────────────────────────────────────────────────────
  { padrao: /duplicate key|already exists|unique constraint|23505/i,
    mensagem: 'Esse registro já existe no sistema. Confira se não foi cadastrado antes.' },
  { padrao: /violates foreign key|23503/i,
    mensagem: 'Esse item está ligado a outros registros e por isso não pode ser alterado ou removido agora.' },
  { padrao: /violates check constraint|23514/i,
    mensagem: 'Algum dado enviado não é aceito pelo sistema. Confira os campos preenchidos e tente de novo.' },
  { padrao: /violates not-null|null value in column|23502/i,
    mensagem: 'Faltou preencher um campo obrigatório. Confira o formulário e tente de novo.' },
  { padrao: /(column|relation).*does not exist|42703|42p01|schema cache/i,
    mensagem: 'O sistema está passando por uma atualização. Recarregue a página em alguns instantes.' },
  { padrao: /bucket not found|object not found|storage/i,
    mensagem: 'Não foi possível salvar o arquivo agora. Tente de novo em alguns instantes.' },

  // ── Erros técnicos de código (nunca devem chegar ao usuário) ──────────────
  { padrao: /attempted to call|client component|server component|use server|use client|hydration|is not a function|cannot read propert|undefined is not|null is not|typeerror|referenceerror|unexpected token|dynamic server usage|next_/i,
    mensagem: 'Ocorreu um erro interno nesta tela. Já registramos o problema — recarregue a página e tente de novo.' },
]

/** Sinais de que a mensagem é técnica (inglesa/código) e não deve ser exibida crua. */
const CARA_DE_TECNICO = /\b(error|failed|invalid|unexpected|cannot|unable|exception|null|undefined|function|module|server|client|request|response|fetch|constraint|column|relation|syntax)\b/i

export function mensagemAmigavel(erro: unknown): string {
  const bruta =
    erro instanceof Error ? erro.message
    : typeof erro === 'string' ? erro
    : (erro as { message?: string } | null)?.message ?? ''

  if (!bruta.trim()) return GENERICA

  for (const { padrao, mensagem } of TRADUCOES) {
    if (padrao.test(bruta)) return mensagem
  }

  // Sem tradução conhecida: se parece técnico, esconde atrás do texto genérico.
  // Se não, é uma mensagem nossa (português, escrita pro usuário) — mostra.
  return CARA_DE_TECNICO.test(bruta) ? GENERICA : bruta
}
