import { LoadingTela } from '@/components/LogoLoading'

/**
 * Loading de rota do nível mais alto — a MARCA girando, grande e centralizada,
 * em tela cheia. Pega o que não tem `loading.tsx` próprio e a primeira carga
 * de qualquer área antes do layout dela existir (login, primeira entrada no
 * admin). As rotas do admin têm o seu (`LoadingConteudo`, com a barra lateral
 * intacta). Nunca sobra tela branca.
 */
export default function Loading() {
  return <LoadingTela />
}
