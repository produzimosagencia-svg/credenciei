import { LoadingTela } from '@/components/LogoLoading'

/**
 * Loading padrão de rota do sistema inteiro — a MARCA girando, grande e
 * centralizada. Aparece ao trocar de módulo / abrir uma tela enquanto o
 * servidor ainda monta o conteúdo, e some sozinho quando a página entra.
 *
 * Rotas com skeleton próprio (o `loading.tsx` da pasta) continuam usando o
 * skeleton — ele mantém a estrutura da tela visível, que é melhor ainda. Este
 * cobre todo o resto, pra nunca sobrar tela branca sem identidade.
 */
export default function Loading() {
  return <LoadingTela />
}
