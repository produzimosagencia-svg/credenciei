import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Settings, Building2, ShieldAlert, ToggleLeft } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { obterPermissoes, obterFuncionalidadesOrganizacao } from '@/lib/actions'
import { PageHeader, Secao, Aviso } from '@/components/ui/Superficie'
import GradePermissoes from './GradePermissoes'
import FuncionalidadesForm from './FuncionalidadesForm'

export const revalidate = 0

/**
 * Configurações — quem pode o quê, agora editável.
 *
 * A tela nasceu só mostrando a régua, porque botão que não faz nada é pior
 * que botão nenhum: quem clica acredita que mudou, e a regra continua a
 * mesma. Agora ela edita de verdade, e a mesma lógica vale ao contrário —
 * cada célula aqui muda o sistema no clique.
 *
 * ─── COMO ISTO NÃO QUEBRA NADA ──────────────────────────────────────────────
 *
 * A tabela `permissoes_organizacao` guarda EXCEÇÕES, não a régua inteira.
 * Vazia — que é como ela nasce — todo papel se comporta exatamente como
 * antes. Foi o que permitiu ligar isto na véspera de um evento: não existe
 * "migrar as permissões atuais", elas continuam no código, e o banco só
 * responde onde alguém decidiu discordar dele.
 *
 * O padrão continua sendo lido das próprias funções de `lib/permissions.ts`
 * (`CAPACIDADES[].padrao`), então a coluna "como é hoje" nunca envelhece em
 * relação ao que o sistema aplica.
 *
 * ─── POR ORGANIZAÇÃO ────────────────────────────────────────────────────────
 *
 * Cada cliente trabalha de um jeito — numa produtora o supervisor escaneia,
 * noutra jamais. "Padrão da plataforma" vale pra quem não tiver regra
 * própria; a regra da organização ganha dele.
 *
 * Master não aparece na grade, de propósito: uma tela de permissões capaz de
 * tirar a permissão de abrir a tela de permissões se tranca sozinha.
 */
export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; aba?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!ehMaster(perfil.role)) redirect('/admin')

  const { org, aba } = await searchParams
  const organizacaoId = org && org !== 'plataforma' ? org : null
  const abaAtiva = aba === 'funcionalidades' ? 'funcionalidades' : 'permissoes'

  const [{ data: organizacoes }, salvas, funcionalidades] = await Promise.all([
    supabase.from('organizacoes').select('id, nome').order('nome'),
    obterPermissoes(organizacaoId),
    obterFuncionalidadesOrganizacao(organizacaoId),
  ])

  const nomeDoEscopo = organizacaoId
    ? (organizacoes ?? []).find(o => o.id === organizacaoId)?.nome ?? 'Organização'
    : 'Padrão da plataforma'

  // Preserva a organização escolhida ao trocar de aba.
  const hrefAba = (a: string) => organizacaoId ? `/admin/configuracoes?org=${organizacaoId}&aba=${a}` : `/admin/configuracoes?aba=${a}`

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Configurações"
        descricao="O que cada tipo de acesso pode fazer, e quais recursos cada cliente usa"
      />

      {/* Links, e não select: o escopo fica na URL e dá pra comparar duas
          organizações em duas abas. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={abaAtiva === 'permissoes' ? '/admin/configuracoes' : `/admin/configuracoes?aba=${abaAtiva}`}
          className={!organizacaoId ? 'btn btn-primario btn-sm' : 'btn btn-secundario btn-sm'}
        >
          <Settings className="w-3.5 h-3.5 shrink-0" /> Padrão da plataforma
        </Link>
        {(organizacoes ?? []).map(o => (
          <Link
            key={o.id as string}
            href={`/admin/configuracoes?org=${o.id}&aba=${abaAtiva}`}
            className={organizacaoId === o.id ? 'btn btn-primario btn-sm' : 'btn btn-secundario btn-sm'}
          >
            <Building2 className="w-3.5 h-3.5 shrink-0" /> {o.nome as string}
          </Link>
        ))}
      </div>

      {/* Aba: Permissões (de sempre) × Funcionalidade do Sistema (nova,
          30/09/2026 — pedido do Vital). */}
      <div className="flex items-center gap-1.5 border-b border-slate-200">
        <Link
          href={hrefAba('permissoes')}
          className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            abaAtiva === 'permissoes' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Permissões
        </Link>
        <Link
          href={hrefAba('funcionalidades')}
          className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            abaAtiva === 'funcionalidades' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Funcionalidade do Sistema
        </Link>
      </div>

      {abaAtiva === 'permissoes' ? (
        <>
          <Aviso tom="atencao" icone={<ShieldAlert className="w-3.5 h-3.5" />}>
            <strong>Vale na hora.</strong> Cada clique muda o sistema imediatamente para quem tem
            aquele tipo de acesso — menu, botões e as próprias ações no servidor. Enquanto uma célula
            estiver no padrão, nada muda em relação a como o sistema sempre funcionou.
          </Aviso>

          <Secao
            tom="acento"
            icone={<Settings className="w-3.5 h-3.5" />}
            titulo={`Permissões — ${nomeDoEscopo}`}
            descricao={organizacaoId
              ? 'O que estiver no padrão aqui segue o padrão da plataforma'
              : 'Vale para toda organização que não tiver regra própria'}
          >
            <GradePermissoes organizacaoId={organizacaoId} salvas={salvas} />
          </Secao>
        </>
      ) : !organizacaoId ? (
        <Aviso tom="atencao" icone={<ToggleLeft className="w-3.5 h-3.5" />}>
          Funcionalidade do sistema é por cliente — não existe &quot;padrão da plataforma&quot; aqui.
          Escolha uma organização acima para configurar.
        </Aviso>
      ) : (
        <Secao
          tom="acento"
          icone={<ToggleLeft className="w-3.5 h-3.5" />}
          titulo={`Funcionalidade do Sistema — ${nomeDoEscopo}`}
          descricao="Recursos avançados, desligados por padrão — só aparecem pra quem ligar"
        >
          {/*
            * `key` = a organização: trocar de cliente no topo é navegação no
            * cliente, e sem remontar o formulário as caixas continuavam com o
            * estado da organização ANTERIOR (06/10/2026 — a Navista aparecia
            * toda desmarcada depois de passar por "Padrão da plataforma", e
            * Salvar ali gravaria os valores errados por cima).
            */}
          <FuncionalidadesForm key={organizacaoId} organizacaoId={organizacaoId} funcionalidades={funcionalidades} />
        </Secao>
      )}
    </div>
  )
}
