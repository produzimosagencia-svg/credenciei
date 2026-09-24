/**
 * O vocabulário do Painel de Performance — texto puro, sem nenhum import.
 *
 * Mesma razão de lib/orcamentos-constantes.ts e lib/veiculos-constantes.ts:
 * as telas do painel rodam no navegador e precisam desta lista sem puxar
 * `supabaseAdmin` (que traria `next/headers` pro bundle do cliente).
 */

export type StatusServico = 'online' | 'atencao' | 'offline' | 'nao_monitorado'

export const ROTULO_STATUS_SERVICO: Record<StatusServico, string> = {
  online: 'Online',
  atencao: 'Atenção',
  offline: 'Offline',
  nao_monitorado: 'Não monitorado',
}

/** Tom do <Badge> (components/ui/Superficie.tsx) pra cada status. */
export const TOM_STATUS_SERVICO: Record<StatusServico, 'neutro' | 'marca' | 'positivo' | 'atencao' | 'negativo'> = {
  online: 'positivo',
  atencao: 'atencao',
  offline: 'negativo',
  nao_monitorado: 'neutro',
}

export function statusServicoValido(bruto: string | null | undefined): StatusServico {
  const s = STATUS_SERVICO.includes(bruto as StatusServico) ? (bruto as StatusServico) : 'nao_monitorado'
  return s
}
export const STATUS_SERVICO: StatusServico[] = ['online', 'atencao', 'offline', 'nao_monitorado']

export type CategoriaServico = 'infraestrutura' | 'aplicacao' | 'integracoes' | 'comunicacao' | 'processos'

export const CATEGORIAS_SERVICO: CategoriaServico[] = ['infraestrutura', 'aplicacao', 'integracoes', 'comunicacao', 'processos']

export const ROTULO_CATEGORIA: Record<CategoriaServico, string> = {
  infraestrutura: 'Infraestrutura',
  aplicacao: 'Aplicação',
  integracoes: 'Integrações',
  comunicacao: 'Comunicação',
  processos: 'Processos',
}

export function categoriaValida(bruto: string | null | undefined): CategoriaServico {
  return CATEGORIAS_SERVICO.includes(bruto as CategoriaServico) ? (bruto as CategoriaServico) : 'integracoes'
}

/** Operacional/Atenção/Degradado/Indisponível — sempre derivado, nunca manual. */
export type StatusGeral = 'operacional' | 'atencao' | 'degradado' | 'indisponivel'

export const ROTULO_STATUS_GERAL: Record<StatusGeral, string> = {
  operacional: 'Operacional',
  atencao: 'Atenção',
  degradado: 'Degradado',
  indisponivel: 'Indisponível',
}

export const TOM_STATUS_GERAL: Record<StatusGeral, 'positivo' | 'atencao' | 'negativo'> = {
  operacional: 'positivo',
  atencao: 'atencao',
  degradado: 'atencao',
  indisponivel: 'negativo',
}

export type NivelIncidente = 'warning' | 'critical'

export const ROTULO_NIVEL: Record<NivelIncidente, string> = {
  warning: 'Atenção',
  critical: 'Crítico',
}

export type StatusIncidente = 'investigando' | 'ativo' | 'resolvido' | 'ignorado'

export const ROTULO_STATUS_INCIDENTE: Record<StatusIncidente, string> = {
  investigando: 'Investigando',
  ativo: 'Ativo',
  resolvido: 'Resolvido',
  ignorado: 'Ignorado',
}

/**
 * O que fica impactado se este serviço cair — texto estático, não um grafo
 * interativo (decisão da v1, ver o plano). Chave é `perf_services.chave`.
 */
export const IMPACTO_POR_SERVICO: Record<string, string[]> = {
  api: ['Aplicativo mobile', 'Painel web inteiro', 'Credenciamento', 'Cadastro de veículos', 'QR Codes', 'Todas as integrações'],
  banco: ['Tudo — nenhuma tela funciona sem banco'],
  storage: ['Fotos de presença', 'Comprovantes de gasto', 'Fotos de veículo'],
  dominio_ssl: ['Acesso ao site pelo domínio próprio (o .vercel.app pode continuar respondendo)'],
  whatsapp: ['Confirmação de cadastro', 'Lembretes automáticos de horário', 'Convites de acesso (supervisor/operador)'],
  fila_mensagens: ['Todo envio de WhatsApp acumula sem sair'],
  gemini: ['Chat administrativo (assistente de IA)', 'Extração de gasto por voz'],
  google: ['Cópia da planilha do evento pro cliente'],
  email: ['Lembrete D-1 de conferência de equipe'],
  conferencia_equipe: ['Lembrete diário de conferência de equipe'],
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const pct = (v: number) => `${v.toFixed(2).replace('.', ',')}%`
export const ms = (v: number) => `${Math.round(v)}ms`
