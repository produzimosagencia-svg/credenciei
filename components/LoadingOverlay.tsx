'use client'
import { useFormStatus } from 'react-dom'
import { LoadingTela } from '@/components/LogoLoading'

/**
 * Overlay de carregamento em tela cheia — feedback visual pra qualquer etapa
 * do sistema que demora (salvar, criar, importar, excluir). Sem ele, o envio
 * de um formulário de página inteira parecia travado até o redirect chegar.
 *
 * É a MARCA girando (ver components/LogoLoading.tsx), não um spinner genérico
 * — o mesmo indicador do sistema inteiro.
 */
export function LoadingOverlay({ mensagem = 'Salvando...' }: { mensagem?: string }) {
  return <LoadingTela mensagem={mensagem} sobreConteudo />
}

/**
 * Versão pra formulários de server action (sem estado próprio no client):
 * basta colocar DENTRO do <form> — aparece sozinha enquanto o envio está
 * pendente, via useFormStatus, e some quando termina.
 */
export function FormLoadingOverlay({ mensagem }: { mensagem?: string }) {
  const { pending } = useFormStatus()
  if (!pending) return null
  return <LoadingOverlay mensagem={mensagem} />
}
