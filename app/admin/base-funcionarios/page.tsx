import { redirect } from 'next/navigation'

/**
 * Redirecionamento — esta tela virou o escopo "Toda a base" de
 * `/admin/encontrar`. Ver o comentário no topo daquele arquivo: eram duas
 * telas com a mesma consulta, diferindo só no filtro de autorização.
 *
 * O redirect existe para quem tinha o link salvo (favorito, aba fixada) não
 * cair num 404 depois da fusão.
 */
export default function BaseFuncionariosRedirect() {
  redirect('/admin/encontrar?ver=todos')
}
