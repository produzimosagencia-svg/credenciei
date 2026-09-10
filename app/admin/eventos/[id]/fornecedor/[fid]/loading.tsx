import { LoadingConteudo } from '@/components/LogoLoading'

// Loading de rota — a marca girando, centralizada na área de conteúdo, com a
// barra lateral intacta. Ao trocar de tela aparece isto até o servidor
// terminar de montar a página. Sem skeleton (a pessoa lia como "quebrado") e
// sem tela branca.
export default function Loading() {
  return <LoadingConteudo />
}
