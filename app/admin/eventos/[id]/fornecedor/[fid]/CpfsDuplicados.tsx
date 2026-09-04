import { CopyX } from 'lucide-react'
import { formatCpf } from '@/lib/format'
import { Secao } from '@/components/ui/Superficie'

/**
 * O mesmo CPF duas vezes na mesma equipe.
 *
 * Não deveria acontecer — o formulário, a importação e o cadastro manual já
 * recusam CPF repetido no evento. Mas as três checagens são feitas em
 * TypeScript, não no banco: não existe índice único que garanta isso, então
 * dois envios no mesmo instante passam pelos dois lados da checagem, e o que
 * entrou antes das regras ficou. O resultado é a mesma pessoa credenciada
 * duas vezes, com dois QR válidos.
 *
 * Por isso este painel só aparece quando há algo errado: numa equipe limpa
 * ele some inteiro, e não vira mais um bloco pra rolar até a tabela.
 *
 * Ele NÃO apaga nada. Quem decide qual das duas linhas fica é quem conhece a
 * equipe — os botões pra isso já estão na tabela logo abaixo.
 */

export type GrupoDuplicado = { cpf: string; nomes: string[] }

/** Agrupa por CPF e devolve só o que aparece mais de uma vez. */
export function acharDuplicados(
  funcionarios: { nome: string; cpf: string | null }[],
): GrupoDuplicado[] {
  const porCpf = new Map<string, string[]>()
  for (const f of funcionarios) {
    // Comparação por dígitos: a mesma pessoa pode ter entrado com máscara
    // por um caminho e sem máscara por outro, e aí os dois textos diferem.
    const cpf = (f.cpf ?? '').replace(/\D/g, '')
    if (!cpf) continue
    porCpf.set(cpf, [...(porCpf.get(cpf) ?? []), f.nome])
  }
  return [...porCpf.entries()]
    .filter(([, nomes]) => nomes.length > 1)
    .map(([cpf, nomes]) => ({ cpf, nomes }))
}

export default function CpfsDuplicados({ grupos }: { grupos: GrupoDuplicado[] }) {
  if (!grupos.length) return null

  const linhas = grupos.reduce((n, g) => n + g.nomes.length, 0)

  return (
    <Secao
      tom="aviso"
      icone={<CopyX className="w-3.5 h-3.5" />}
      titulo={`${grupos.length} CPF${grupos.length === 1 ? '' : 's'} repetido${grupos.length === 1 ? '' : 's'} nesta equipe`}
      descricao={`${linhas} cadastros para ${grupos.length} pessoa${grupos.length === 1 ? '' : 's'} — confira antes de credenciar`}
      corpoClassName="p-4 space-y-3"
    >
      <ul className="space-y-2">
        {grupos.map(g => (
          <li key={g.cpf} className="bg-white border border-amber-200 rounded-xl px-3 py-2">
            <p className="text-slate-800 text-sm font-semibold tabular-nums">
              CPF {formatCpf(g.cpf)}
              <span className="text-amber-700 font-medium ml-2">
                {g.nomes.length} cadastros
              </span>
            </p>
            <ul className="mt-1 space-y-0.5">
              {g.nomes.map((nome, i) => (
                <li key={`${g.cpf}-${i}`} className="text-slate-600 text-sm">
                  {nome} — CPF: {formatCpf(g.cpf)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="text-slate-500 text-xs">
        Busque o CPF na tabela abaixo e apague o cadastro que sobrou. Se a pessoa já
        bateu ponto em um deles, apague o outro — o histórico vai junto com o cadastro.
      </p>
    </Secao>
  )
}
