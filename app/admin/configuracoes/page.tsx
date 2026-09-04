import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Settings, Building2, ShieldAlert } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { obterPermissoes } from '@/lib/actions'
import { PageHeader, Secao, Aviso } from '@/components/ui/Superficie'
import GradePermissoes from './GradePermissoes'

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
  searchParams: Promise<{ org?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!ehMaster(perfil.role)) redirect('/admin')

  const { org } = await searchParams
  const organizacaoId = org && org !== 'plataforma' ? org : null

  const [{ data: organizacoes }, salvas] = await Promise.all([
    supabase.from('organizacoes').select('id, nome').order('nome'),
    obterPermissoes(organizacaoId),
  ])

  const nomeDoEscopo = organizacaoId
    ? (organizacoes ?? []).find(o => o.id === organizacaoId)?.nome ?? 'Organização'
    : 'Padrão da plataforma'

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Configurações"
        descricao="O que cada tipo de acesso pode fazer no sistema"
      />

      <Aviso tom="atencao" icone={<ShieldAlert className="w-3.5 h-3.5" />}>
        <strong>Vale na hora.</strong> Cada clique muda o sistema imediatamente para quem tem
        aquele tipo de acesso — menu, botões e as próprias ações no servidor. Enquanto uma célula
        estiver no padrão, nada muda em relação a como o sistema sempre funcionou.
      </Aviso>

      {/* Links, e não select: o escopo fica na URL e dá pra comparar duas
          organizações em duas abas. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href="/admin/configuracoes"
          className={!organizacaoId ? 'btn btn-primario btn-sm' : 'btn btn-secundario btn-sm'}
        >
          <Settings className="w-3.5 h-3.5 shrink-0" /> Padrão da plataforma
        </Link>
        {(organizacoes ?? []).map(o => (
          <Link
            key={o.id as string}
            href={`/admin/configuracoes?org=${o.id}`}
            className={organizacaoId === o.id ? 'btn btn-primario btn-sm' : 'btn btn-secundario btn-sm'}
          >
            <Building2 className="w-3.5 h-3.5 shrink-0" /> {o.nome as string}
          </Link>
        ))}
      </div>

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
    </div>
  )
}
