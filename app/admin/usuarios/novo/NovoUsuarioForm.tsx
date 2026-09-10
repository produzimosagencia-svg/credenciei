'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Users, UserCog, Building2 } from 'lucide-react'
import { criarSupervisor, criarOperadorPortaria, criarSuporte, adicionarAdmin } from '@/lib/actions'
import { capacidadesDoPapel } from '@/lib/permissions'
import { NomeInput, CpfInput, TelefoneInput } from '@/components/inputs'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { mensagemAmigavel } from '@/lib/erros'
import SeletorLista from '@/components/SeletorLista'

type Evento = { id: string; nome: string; organizacao_id: string | null; fornecedores: { id: string; nome: string }[] }
type Org = { id: string; nome: string }

type Funcao = 'supervisor' | 'operador_portao' | 'suporte' | 'admin'

const FUNCOES: { valor: Funcao; rotulo: string; icone: React.ElementType; vinculo: string; ajuda: string; login: 'cpf' | 'email' }[] = [
  { valor: 'admin', rotulo: 'Admin', icone: Building2, vinculo: 'organização',
    ajuda: 'Gerencia a organização inteira — eventos, setores, equipe e acessos. Entra por e-mail e senha.', login: 'email' },
  { valor: 'supervisor', rotulo: 'Supervisor', icone: Users, vinculo: 'evento + setor',
    ajuda: 'Fica preso a um único setor: enxerga só a equipe daquele setor. Se cuida de dois, crie dois acessos.', login: 'cpf' },
  { valor: 'operador_portao', rotulo: 'Gestor de credenciamento', icone: ShieldCheck, vinculo: 'evento',
    ajuda: 'Lê o QR no portão e registra ponto. Não gerencia evento nem equipe. Pertence à organização — cobre vários eventos do mesmo cliente.', login: 'cpf' },
  { valor: 'suporte', rotulo: 'Suporte de sistema', icone: UserCog, vinculo: 'evento',
    ajuda: 'Apoio contratado pro dia do evento: conserta CPF, setor, ponto que não bateu. Nunca administra. Pode ter prazo de validade.', login: 'cpf' },
]

export default function NovoAcessoForm({
  eventos, organizacoes, ehMaster,
}: {
  eventos: Evento[]
  organizacoes: Org[]
  ehMaster: boolean
}) {
  const disponiveis = useMemo(
    () => FUNCOES.filter(f => f.valor !== 'suporte' || ehMaster),
    [ehMaster],
  )

  // Supervisor é de longe o acesso mais criado — começa nele.
  const [funcao, setFuncao] = useState<Funcao>('supervisor')
  const [eventoId, setEventoId] = useState(eventos[0]?.id ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const cfg = FUNCOES.find(f => f.valor === funcao)!
  const evento = eventos.find(e => e.id === eventoId)
  const setores = evento?.fornecedores ?? []

  // Toggles da aba "Funções": um por capacidade que o papel oferece, começando
  // no valor que aquele papel tem hoje.
  const capacidades = useMemo(() => capacidadesDoPapel(funcao), [funcao])
  const [ligadas, setLigadas] = useState<Record<string, boolean>>({})
  const valorToggle = (chave: string, padrao: boolean) =>
    chave in ligadas ? ligadas[chave] : padrao

  // Ao trocar de função, os toggles do papel anterior deixam de valer.
  const trocarFuncao = (f: Funcao) => {
    setFuncao(f)
    setLigadas({})
    setErro(null)
  }

  const handleSubmit = (formData: FormData) => {
    setErro(null)

    // Só o que difere do padrão vai pro override — o resto o servidor
    // completa pela régua do papel.
    const overrides: Record<string, boolean> = {}
    for (const c of capacidades) {
      const v = valorToggle(c.chave, c.padraoAtual)
      if (v !== c.padraoAtual) overrides[c.chave] = v
    }
    formData.set('permissoes_usuario', JSON.stringify(overrides))

    startTransition(async () => {
      try {
        if (funcao === 'supervisor') {
          const fornecedorId = (formData.get('fornecedor_id') as string) || ''
          if (!eventoId) return setErro('Escolha o evento.')
          if (!fornecedorId) return setErro('Escolha o setor do supervisor.')
          await criarSupervisor(fornecedorId, eventoId, formData)
        } else if (funcao === 'operador_portao') {
          if (!eventoId) return setErro('Escolha o evento.')
          await criarOperadorPortaria(eventoId, formData)
        } else if (funcao === 'suporte') {
          if (!eventoId) return setErro('Escolha o evento de atendimento.')
          formData.append('escopo_evento_id', eventoId)
          await criarSuporte(formData)
        } else {
          if (ehMaster && !(formData.get('organizacao_id') as string)) {
            return setErro('Escolha a organização deste admin.')
          }
          await adicionarAdmin(formData)
        }
        router.push('/admin/usuarios')
        router.refresh()
      } catch (e) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  const semEvento = !eventos.length && funcao !== 'admin'

  return (
    <form action={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
      {/* ─── Função ─────────────────────────────────────────────────────── */}
      <div className="space-y-2" data-tutorial="novo-acesso-funcao">
        <label className="text-sm font-medium text-slate-700">Função no sistema *</label>
        <div className="grid sm:grid-cols-2 gap-2">
          {disponiveis.map(f => {
            const ativa = funcao === f.valor
            return (
              <button
                key={f.valor}
                type="button"
                onClick={() => trocarFuncao(f.valor)}
                aria-pressed={ativa}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  ativa ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  <f.icone className={`w-4 h-4 ${ativa ? 'text-brand-600' : 'text-slate-400'}`} />
                  <span className="text-sm font-semibold text-slate-800">{f.rotulo}</span>
                </span>
                <span className="block text-2xs text-slate-500 mt-1">Vínculo: {f.vinculo}</span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-slate-500">{cfg.ajuda}</p>
      </div>

      {semEvento ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          Nenhum evento ativo. Crie um evento (e um setor, pro supervisor) antes de criar este acesso.
        </div>
      ) : (
        <>
          {/* ─── Vínculo / escopo ─────────────────────────────────────── */}
          <div className="space-y-3" data-tutorial="novo-acesso-escopo">
            {funcao === 'admin' ? (
              ehMaster ? (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Organização *</label>
                  <SeletorLista
                    name="organizacao_id"
                    required
                    defaultValor=""
                    titulo="Escolha a organização"
                    busca
                    opcoes={organizacoes.map(o => ({ valor: o.id, rotulo: o.nome }))}
                  />
                  <p className="text-xs text-slate-500">O admin será adicionado a esta organização, junto do que já existe.</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
                  O admin será adicionado à <strong>sua organização</strong>.
                </p>
              )
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Evento *</label>
                  <SeletorLista
                    valor={eventoId}
                    onChange={setEventoId}
                    titulo="Escolha o evento"
                    busca
                    opcoes={eventos.map(e => ({ valor: e.id, rotulo: e.nome }))}
                  />
                </div>

                {funcao === 'supervisor' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Setor *</label>
                    {!setores.length ? (
                      <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
                        Este evento ainda não tem setores cadastrados.
                      </p>
                    ) : (
                      <SeletorLista
                        key={eventoId}
                        name="fornecedor_id"
                        required
                        defaultValor=""
                        titulo="Escolha o setor"
                        busca
                        opcoes={setores.map(s => ({ valor: s.id, rotulo: s.nome }))}
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ─── Identificação ────────────────────────────────────────── */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Nome *</label>
              <NomeInput name="nome" required placeholder="Nome da pessoa" className="input" />
            </div>

            {cfg.login === 'email' ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">E-mail *</label>
                  <input name="email" type="email" required placeholder="pessoa@empresa.com" className="input" autoComplete="off" />
                  <p className="text-xs text-slate-500">O admin entra no sistema por e-mail e senha.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Senha inicial *</label>
                  <input name="senha" type="text" required minLength={6} placeholder="Mínimo 6 caracteres" className="input" autoComplete="off" />
                  <p className="text-xs text-slate-500">Em texto pra você copiar e repassar. A pessoa troca depois.</p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">CPF *</label>
                  <CpfInput name="cpf" required placeholder="000.000.000-00" className="input" />
                  <p className="text-xs text-slate-500">É o CPF que a pessoa usa para entrar no sistema.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">WhatsApp *</label>
                  <TelefoneInput name="telefone" required placeholder="(11) 99999-9999" className="input" />
                  <p className="text-xs text-slate-500">Recebe por aqui o link para criar a senha.</p>
                </div>
                {funcao === 'supervisor' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Email (opcional)</label>
                    <input name="email_contato" type="email" placeholder="pessoa@email.com" className="input" autoComplete="off" />
                    <p className="text-xs text-slate-500">Para o lembrete de conferência de equipe, 1 dia antes do evento, com a planilha anexa.</p>
                  </div>
                )}
              </>
            )}

            {funcao === 'suporte' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Acesso expira em</label>
                <input name="acesso_expira_em" type="date" className="input" />
                <p className="text-xs text-slate-500">Opcional. Passada a data, o acesso para de funcionar sozinho.</p>
              </div>
            )}
          </div>

          {/* ─── Funções ligadas ──────────────────────────────────────── */}
          {!!capacidades.length && (
            <div className="space-y-2 border-t border-slate-100 pt-4" data-tutorial="novo-acesso-funcoes">
              <label className="text-sm font-medium text-slate-700">Funções ligadas</label>
              <p className="text-xs text-slate-500">
                Já vem com o padrão de <strong>{cfg.rotulo}</strong>. Desligue o que esta pessoa não deve ter.
              </p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {capacidades.map(c => {
                  const on = valorToggle(c.chave, c.padraoAtual)
                  return (
                    <label key={c.chave} className="flex items-start gap-3 p-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={e => setLigadas(m => ({ ...m, [c.chave]: e.target.checked }))}
                        className="mt-0.5 h-4 w-4 accent-brand-500 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-slate-800">{c.nome}</span>
                        <span className="block text-2xs text-slate-500">{c.descricao}</span>
                        {c.peso && on && !c.padraoAtual && (
                          <span className="block text-2xs text-amber-700 mt-0.5">⚠ {c.peso}</span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* ─── Status ───────────────────────────────────────────────── */}
          <div className="space-y-1.5 border-t border-slate-100 pt-4" data-tutorial="novo-acesso-status">
            <label className="text-sm font-medium text-slate-700">Status</label>
            <SeletorLista name="ativo" defaultValor="true" titulo="Status" opcoes={[
              { valor: 'true', rotulo: 'Ativo' },
              { valor: 'false', rotulo: 'Inativo' },
            ]} />
          </div>

          {erro && <p className="text-red-500 text-xs">{erro}</p>}

          <button
            type="submit"
            disabled={isPending || (funcao === 'supervisor' && !setores.length)}
            className="w-full btn btn-primario btn-lg"
          >
            {isPending ? 'Criando...' : 'Criar acesso'}
          </button>
        </>
      )}

      {isPending && <LoadingOverlay mensagem="Criando acesso..." />}
    </form>
  )
}
