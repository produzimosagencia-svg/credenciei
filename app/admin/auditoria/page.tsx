import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, ArrowRight, User, MapPin } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarUsuarios, ROLE_LABELS, type Role } from '@/lib/permissions'
import { obterAuditoria, opcoesDaAuditoria } from '@/lib/actions'
import { ACAO_LABELS } from '@/lib/suporte'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { PageHeader, Secao, EmptyState, Badge } from '@/components/ui/Superficie'
import FiltrosAuditoria from './FiltrosAuditoria'

export const revalidate = 0

/**
 * A trilha de "quem alterou o quê" — CPF, setor, ativação, ponto assistido,
 * senha, supervisor. Ver `alteracoes_cadastro` (supabase/upgrade-suporte.sql)
 * e `registrarAuditoria` (lib/auditoria.ts), chamada por toda ação sensível,
 * não só quando o autor é suporte.
 *
 * O filtro por escopo já vem PRONTO de `obterAuditoria`: master vê tudo,
 * admin a própria organização, suporte só o que ele mesmo fez. Esta página
 * não filtra de novo — confiar na mesma função que decide em qualquer outro
 * lugar evita duas réguas divergindo.
 *
 * O período, sim, mora aqui: vem na URL (`?dias=`) e desce pra consulta, que
 * corta no banco. Filtrar depois de buscar seria mentira — o teto de 200
 * linhas já teria comido os dias antigos antes de qualquer filtro.
 *
 * ─── POR QUE NÃO É UMA TABELA ───────────────────────────────────────────────
 *
 * Era, com seis colunas, e duas delas cortadas no meio por `truncate`: o
 * motivo e o "de → para", justamente o que se vem ler aqui. Cada linha
 * responde uma pergunta inteira ("quem desativou a Kely, quando, por quê, e
 * ela era de qual setor?"), e isso não cabe numa célula de 14rem. Em bloco,
 * cabe tudo e ainda funciona no celular — que é de onde o supervisor olha.
 */

const PERIODOS = [
  { dias: 1, label: 'Hoje' },
  { dias: 7, label: '7 dias' },
  { dias: 30, label: '30 dias' },
  { dias: 0, label: 'Tudo' },
] as const

const LIMITE = 200

/**
 * A cor diz a natureza da ação antes de a pessoa ler a linha.
 *
 * Vermelho para o que destrói (exclusão, bloqueio), âmbar para o que muda
 * situação, neutro para correção de dado. Ação sem entrada aqui cai no
 * neutro — nunca fica sem cor.
 */
const TOM_DA_ACAO: Record<string, 'negativo' | 'atencao' | 'positivo' | 'neutro'> = {
  EXCLUSAO_FUNCIONARIO: 'negativo',
  EXCLUSAO_PONTO: 'negativo',
  DESCREDENCIAMENTO: 'negativo',
  BLOQUEIO_CPF: 'negativo',
  DESATIVACAO_FUNCIONARIO: 'atencao',
  DESBLOQUEIO_CPF: 'positivo',
  ATIVACAO_FUNCIONARIO: 'positivo',
  CADASTRO_EMERGENCIAL: 'atencao',
  REGISTRO_ENTRADA_ASSISTIDA: 'atencao',
  REGISTRO_SAIDA_ASSISTIDA: 'atencao',
  CORRECAO_PONTO: 'atencao',
  RESET_SENHA: 'atencao',
  REABERTURA_TURNO: 'atencao',
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; autor?: string; setor?: string; acao?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil || !(podeGerenciarUsuarios(perfil) || perfil.role === 'suporte')) redirect('/admin')

  /*
   * Padrão 7 dias, e não "tudo".
   *
   * A tela existe pra responder "quem mexeu nisso?" — uma pergunta que
   * quase sempre é sobre esta semana. Abrindo com o histórico inteiro, o
   * que aconteceu hoje some no meio de meses de registro.
   */
  const { dias: diasParam, autor, setor, acao } = await searchParams
  const escolhido = PERIODOS.find(p => String(p.dias) === diasParam) ?? PERIODOS[1]

  const [linhas, opcoes] = await Promise.all([
    obterAuditoria({
      limite: LIMITE, dias: escolhido.dias,
      autorId: autor || undefined, acao: acao || undefined, setor: setor || undefined,
    }),
    opcoesDaAuditoria(),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Auditoria"
        descricao={perfil.role === 'suporte' ? 'As alterações que você fez' : 'Correção de cadastro, mudança de setor, ativação, ponto e senha'}
      />

      {/* Links, e não botões: o período fica na URL, então dá pra voltar,
          recarregar e mandar o link de um período específico pra outra pessoa. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODOS.map(p => {
          // O período troca sem derrubar o recorte: quem filtrou por pessoa
          // e muda de "7 dias" pra "tudo" quer a MESMA pessoa em mais tempo.
          const q = new URLSearchParams()
          if (p.dias !== 7) q.set('dias', String(p.dias))
          if (autor) q.set('autor', autor)
          if (setor) q.set('setor', setor)
          if (acao) q.set('acao', acao)
          return (
            <Link
              key={p.dias}
              href={q.toString() ? `/admin/auditoria?${q}` : '/admin/auditoria'}
              className={p.dias === escolhido.dias ? 'btn btn-primario btn-sm' : 'btn btn-secundario btn-sm'}
            >
              {p.label}
            </Link>
          )
        })}
      </div>

      <FiltrosAuditoria opcoes={opcoes} periodoDias={escolhido.dias} totalNaTela={linhas.length} />

      <Secao
        tom="acento"
        icone={<ClipboardList className="w-3.5 h-3.5" />}
        titulo={`${linhas.length}${linhas.length === LIMITE ? '+' : ''} alteraç${linhas.length === 1 ? 'ão' : 'ões'}`}
        descricao={escolhido.dias === 0
          ? 'Todo o histórico'
          : escolhido.dias === 1 ? 'Hoje, desde a meia-noite' : `Últimos ${escolhido.dias} dias`}
        corpoClassName={linhas.length ? '' : 'p-4'}
      >
        {!linhas.length ? (
          <EmptyState
            icone={<ClipboardList className="w-7 h-7" />}
            titulo={autor || setor || acao
              ? 'Nada encontrado com esses filtros'
              : escolhido.dias === 0 ? 'Nenhuma alteração registrada ainda' : 'Nenhuma alteração neste período'}
            descricao={autor || setor || acao
              ? 'Tente limpar um filtro ou aumentar o período.'
              : escolhido.dias === 0 ? undefined : 'Escolha um período maior aí em cima.'}
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {linhas.map(l => (
                <li key={l.id} className="px-4 py-3 hover:bg-slate-50/60 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge tom={TOM_DA_ACAO[l.acao] ?? 'neutro'}>{ACAO_LABELS[l.acao] ?? l.acao}</Badge>
                    {l.campoAlterado && (
                      <span className="text-slate-700 text-sm font-medium">{l.campoAlterado}</span>
                    )}
                    <span className="text-slate-400 text-xs tabular-nums ml-auto whitespace-nowrap">
                      {formatarBR(l.criadoEm, 'completo')}
                    </span>
                  </div>

                  {/* De → Para inteiro, sem corte: é o miolo do registro. */}
                  {(l.valorAnterior || l.valorNovo) && (
                    <p className="flex flex-wrap items-center gap-1.5 text-sm">
                      {l.valorAnterior && (
                        <span className="text-slate-500 line-through decoration-slate-300 break-all">
                          {l.valorAnterior}
                        </span>
                      )}
                      {l.valorAnterior && l.valorNovo && (
                        <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                      )}
                      {l.valorNovo && <span className="text-slate-800 font-medium break-all">{l.valorNovo}</span>}
                    </p>
                  )}

                  {/* Quem sofreu a alteração — com CPF e setor, que é o que
                      permite achar a pessoa depois sem adivinhar homônimo. */}
                  {l.funcionarioNome && (
                    <p className="flex flex-wrap items-center gap-x-2 text-slate-500 text-xs">
                      <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                        <User className="w-3 h-3 shrink-0" /> {l.funcionarioNome}
                      </span>
                      {l.funcionarioCpf && <span className="tabular-nums">CPF {formatCpf(l.funcionarioCpf)}</span>}
                      {l.funcionarioSetor && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" /> {l.funcionarioSetor}
                        </span>
                      )}
                    </p>
                  )}

                  {l.motivo && (
                    <p className="text-slate-500 text-xs">
                      <span className="text-slate-400">Motivo:</span> {l.motivo}
                    </p>
                  )}

                  <p className="flex flex-wrap items-center gap-x-2 text-slate-400 text-2xs">
                    <span>
                      por <span className="text-slate-500 font-medium">{l.usuarioResponsavel}</span>
                      {l.autorRole && ` (${ROLE_LABELS[l.autorRole as Role] ?? l.autorRole}`}
                      {/* De onde ele é: "o supervisor do Bar" diz mais do que o nome. */}
                      {l.autorRole && l.autorSetor && ` · ${l.autorSetor}`}
                      {l.autorRole && ')'}
                    </span>
                    {l.eventoNome && <span>· {l.eventoNome}</span>}
                    {l.ip && <span className="tabular-nums">· IP {l.ip}</span>}
                  </p>
                </li>
              ))}
            </ul>
            {/* O teto não pode ser silencioso: sem este aviso, "não achei"
                pareceria "não aconteceu" quando o período passa de 200 linhas. */}
            {linhas.length === LIMITE && (
              <p className="text-slate-400 text-xs px-4 py-2.5 border-t border-slate-100">
                Mostrando as {LIMITE} alterações mais recentes deste período. Escolha um
                período menor pra ver o que ficou de fora.
              </p>
            )}
          </>
        )}
      </Secao>
    </div>
  )
}
