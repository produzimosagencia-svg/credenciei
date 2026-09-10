import Link from 'next/link'
import { BellRing, ArrowRight, Building2, CheckSquare } from 'lucide-react'
import { listarBacklog, cobrancas, resumoBacklog, hojeBRT } from '@/lib/backlog'
import { Secao } from '@/components/ui/Superficie'

/**
 * "O que precisa da minha atenção hoje?" — o Backlog aparecendo no Painel.
 *
 * O pedido pede indicadores do Backlog no dashboard, mas um bloco de nove
 * números ali em cima competiria com os do evento em andamento, que é o que
 * a tela existe pra mostrar. Então aqui vai só a resposta: o que está
 * atrasado e o que vence hoje, com o caminho pro Backlog inteiro. Os números
 * completos moram na tela do módulo.
 *
 * Some sozinho quando não há nada cobrando — um cartão que diz "0 pendências"
 * todo dia vira ruído e some do olhar justo no dia em que tiver 3.
 */
export default async function AtencaoHoje() {
  const hoje = hojeBRT()

  let itens
  try {
    itens = await listarBacklog()
  } catch {
    /*
     * A migração do Backlog pode ainda não ter rodado. O Painel é a primeira
     * tela do sistema, aberta por todo mundo, todo dia — ela não pode quebrar
     * por causa de um módulo que talvez nem exista ainda no banco.
     */
    return null
  }

  const fila = cobrancas(itens, hoje)
  const numeros = resumoBacklog(itens, hoje)
  const cobrando = [...fila.atrasados, ...fila.hoje]
  if (!cobrando.length) return null

  return (
    <Secao
      tom={fila.atrasados.length ? 'aviso' : 'acento'}
      icone={<BellRing className="w-3.5 h-3.5" />}
      titulo="O que precisa da minha atenção hoje"
      descricao={`${fila.atrasados.length} atrasado${fila.atrasados.length === 1 ? '' : 's'} · ${fila.hoje.length} para hoje · ${numeros.emNegociacao} em negociação`}
      acoes={
        <Link href="/admin/backlog?ver=contatos" className="btn btn-secundario btn-sm">
          Abrir o Backlog <ArrowRight className="w-3.5 h-3.5 shrink-0" />
        </Link>
      }
      corpoClassName="p-0"
    >
      <ul className="divide-y divide-slate-100">
        {cobrando.slice(0, 6).map(({ item, data, diasDeAtraso }) => {
          const Icone = item.tipo === 'cliente' ? Building2 : CheckSquare
          return (
            <li key={item.id}>
              <Link
                href={`/admin/backlog?ver=contatos&busca=${encodeURIComponent(item.titulo)}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
              >
                <Icone className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-slate-800 text-sm font-medium truncate">{item.titulo}</span>
                  <span className="block text-slate-400 text-2xs truncate">
                    {item.tipo === 'cliente' ? 'Retornar contato' : 'Prazo de tarefa'}
                    {item.responsavelNome ? ` · ${item.responsavelNome}` : ''}
                  </span>
                </span>
                <span className={`text-2xs font-semibold shrink-0 ${diasDeAtraso > 0 ? 'text-red-600' : 'text-amber-700'}`}>
                  {diasDeAtraso > 0 ? `${diasDeAtraso}d atrasado` : 'hoje'}
                </span>
                <span className="text-slate-300 text-2xs tabular-nums shrink-0 hidden sm:inline">{data.slice(8)}/{data.slice(5, 7)}</span>
              </Link>
            </li>
          )
        })}
        {cobrando.length > 6 && (
          <li className="px-4 py-2">
            <Link href="/admin/backlog?ver=contatos" className="text-brand-600 text-xs hover:underline">
              e mais {cobrando.length - 6} {cobrando.length - 6 === 1 ? 'item' : 'itens'}
            </Link>
          </li>
        )}
      </ul>
    </Secao>
  )
}
