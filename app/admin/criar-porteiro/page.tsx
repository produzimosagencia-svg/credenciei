import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck, CalendarDays, ScanLine, ClipboardCheck, KeyRound } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarUsuarios, podeExcluir as podeExcluirDeVerdade } from '@/lib/permissions'
import { PageHeader, Secao } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import OperadorPortariaCard from '../eventos/[id]/OperadorPortariaCard'

export const revalidate = 0

/**
 * Criar porteiro — o acesso de quem fica no portão lendo QR.
 *
 * A criação em si já existia dentro da tela do evento
 * (`OperadorPortariaCard`, reaproveitado aqui inteiro). O que esta tela
 * acrescenta é a EXPLICAÇÃO: "operador de portão" é o nome do papel no
 * sistema, mas quem contrata pensa "porteiro", e sem dizer o que ele
 * enxerga e o que não enxerga o organizador não sabe se pode entregar esse
 * acesso a um terceiro. Era a dúvida que sobrava.
 */
export default async function CriarPorteiroPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  // Mesma régua de `criarOperadorPortaria`: quem gerencia acessos.
  if (!podeGerenciarUsuarios(perfil)) redirect('/admin')

  const { evento: eventoParam } = await searchParams

  if (!eventoParam) {
    return (
      <div className="space-y-5">
        <PageHeader titulo="Gestor de credenciamento" descricao="O acesso de quem fica no portão lendo o QR da equipe" />
        <ComoFunciona />
        <EscolherEvento
          eventos={await eventosQuePossoAbrir()}
          href={id => `/admin/criar-porteiro?evento=${id}`}
          icone={<ShieldCheck className="w-3.5 h-3.5" />}
          titulo="Para qual evento?"
          descricao="O porteiro é da organização, mas o cadastro parte da equipe já credenciada no evento"
          vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para poder cadastrar um porteiro.' }}
          mostrarOrganizacao={veTodosEventos(perfil)}
        />
      </div>
    )
  }

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoParam).single()
  if (!evento) notFound()
  if (!veTodosEventos(perfil) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  const { data: setores } = await supabase
    .from('fornecedores').select('id').eq('evento_id', eventoParam)
  const idsSetores = (setores ?? []).map(s => s.id as string)

  const [{ data: operadores }, { data: funcionarios }] = await Promise.all([
    /*
     * Operadores são da ORGANIZAÇÃO, não deste evento: a mesma pessoa opera
     * o portão de vários eventos do mesmo cliente sem precisar de um login
     * novo a cada vez.
     */
    evento.organizacao_id
      ? supabase.from('perfis').select('id, nome, email, cpf, telefone, ativo')
          .eq('role', 'operador_portao').eq('organizacao_id', evento.organizacao_id).order('nome')
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    idsSetores.length
      ? supabase.from('funcionarios').select('id, nome, cpf, telefone').in('fornecedor_id', idsSetores).order('nome')
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Gestor de credenciamento"
        descricao={`${evento.nome} — o acesso de quem fica no portão lendo o QR`}
        acoes={
          <Link href="/admin/criar-porteiro" className="btn btn-secundario">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
          </Link>
        }
      />

      <ComoFunciona />

      <OperadorPortariaCard
        eventoId={eventoParam}
        operadores={(operadores ?? []) as { id: string; nome: string; email: string; cpf: string | null; telefone: string | null; ativo: boolean }[]}
        funcionariosDoEvento={(funcionarios ?? []) as { id: string; nome: string; cpf: string; telefone: string }[]}
        podeExcluir={podeExcluirDeVerdade(perfil.role)}
      />
    </div>
  )
}

/**
 * A explicação pedida: o que o porteiro faz, o que ele NÃO faz e como ele
 * entra. O "não faz" é a metade que importa — é ela que responde a pergunta
 * real de quem vai entregar o acesso a um contratado.
 */
function ComoFunciona() {
  const faz = [
    { icone: ScanLine, titulo: 'Lê o QR no portão', texto: 'Escaneia a credencial da equipe e registra entrada e saída na hora.' },
    { icone: ClipboardCheck, titulo: 'Registra ponto no lugar da pessoa', texto: 'Quando o QR não abre ou o celular morreu: acha a pessoa, tira a foto do rosto e registra. Fica gravado quem registrou.' },
    { icone: KeyRound, titulo: 'Entra com o próprio CPF', texto: 'Recebe um WhatsApp com um link para criar a senha. Depois entra com CPF e senha — não precisa de senha de admin.' },
  ]

  return (
    <Secao
      tom="acento"
      icone={<ShieldCheck className="w-3.5 h-3.5" />}
      titulo="O que o porteiro faz"
      descricao="No sistema esse acesso se chama “operador de portão”"
      corpoClassName="p-5 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {faz.map(f => (
          <div key={f.titulo} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <f.icone className="w-4 h-4 text-brand-500" />
            <p className="text-slate-800 text-sm font-semibold mt-1.5">{f.titulo}</p>
            <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{f.texto}</p>
          </div>
        ))}
      </div>

      <p className="text-slate-400 text-xs">
        O porteiro pertence à <strong>organização</strong>, não a um evento: a mesma pessoa cobre o
        portão de vários eventos do mesmo cliente sem precisar de um acesso novo a cada vez. Quando
        o trabalho acabar, marque como <strong>Inativo</strong> em vez de excluir — o histórico das
        batidas que ela registrou continua de pé.
      </p>
    </Secao>
  )
}
