import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos } from '@/lib/permissions'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import FuncionarioTable, { type Presenca } from './FuncionarioTable'
import CopyLinkButton from '../../CopyLinkButton'
import NovoFuncionarioModal from './NovoFuncionarioModal'

export const revalidate = 0

type MomentoTipo = 'entrada' | 'meio' | 'fim'

export default async function FornecedorPage({ params }: { params: Promise<{ id: string; fid: string }> }) {
  const { id, fid } = await params

  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const [{ data: fornecedor }, { data: funcionarios }, { data: registros }] = await Promise.all([
    supabase.from('fornecedores').select('*, eventos(nome, organizacao_id)').eq('id', fid).single(),
    supabase.from('funcionarios').select('id, nome, cpf, telefone, empresa, cargo, qr_token, valor_receber').eq('fornecedor_id', fid).order('nome'),
    supabase
      .from('registros')
      .select('funcionario_id, tipo, created_at, foto_url, latitude, longitude, funcionarios!inner(fornecedor_id)')
      .eq('evento_id', id)
      .eq('funcionarios.fornecedor_id', fid)
      .in('tipo', ['entrada', 'meio', 'fim']),
  ])

  if (!fornecedor) notFound()

  // Isolamento: supervisor só vê o PRÓPRIO setor; demais papéis, só a própria organização
  const organizacaoDoEvento = (fornecedor.eventos as any)?.organizacao_id
  if (perfil.role === 'supervisor') {
    if (perfil.fornecedor_id !== fid) notFound()
  } else if (!veTodosEventos(perfil.role) && organizacaoDoEvento !== perfil.organizacao_id) {
    notFound()
  }

  // Assina as URLs das fotos em lote (bucket privado)
  const paths = (registros ?? []).map(r => r.foto_url).filter((p): p is string => !!p)
  const urlPorPath: Record<string, string> = {}
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('presencas').createSignedUrls(paths, 60 * 60)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlPorPath[s.path] = s.signedUrl
  }

  // Mapa funcionario → { entrada, meio, fim }
  const presencaPorFunc: Record<string, Record<MomentoTipo, Presenca>> = {}
  for (const r of registros ?? []) {
    const tipo = r.tipo as MomentoTipo
    if (!presencaPorFunc[r.funcionario_id]) presencaPorFunc[r.funcionario_id] = { entrada: null, meio: null, fim: null }
    presencaPorFunc[r.funcionario_id][tipo] = {
      feitoEm: r.created_at,
      fotoUrl: r.foto_url ? urlPorPath[r.foto_url] ?? null : null,
      lat: r.latitude ?? null,
      lng: r.longitude ?? null,
    }
  }

  const funcionariosEnriquecidos = (funcionarios ?? []).map(f => ({
    id: f.id,
    nome: f.nome,
    cpf: f.cpf,
    telefone: f.telefone,
    empresa: f.empresa ?? '',
    cargo: f.cargo ?? '',
    qr_token: f.qr_token,
    valorReceber: f.valor_receber ?? 0,
    entrada: presencaPorFunc[f.id]?.entrada ?? null,
    meio: presencaPorFunc[f.id]?.meio ?? null,
    fim: presencaPorFunc[f.id]?.fim ?? null,
  }))

  const total = funcionarios?.length ?? 0
  const contar = (t: MomentoTipo) => funcionariosEnriquecidos.filter(f => f[t]).length
  const totalReceber = funcionariosEnriquecidos.reduce((acc, f) => acc + f.valorReceber, 0)
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const formLink = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/form/${fornecedor.token_formulario}`

  const stats = [
    { label: 'Total', value: String(total), color: 'text-slate-800', bg: 'bg-slate-100', border: 'border-slate-200' },
    { label: 'Entrada', value: String(contar('entrada')), color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { label: 'Meio', value: String(contar('meio')), color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Fim', value: String(contar('fim')), color: 'text-brand-600', bg: 'bg-brand-50', border: 'border-brand-200' },
    { label: 'A pagar', value: brl(totalReceber), color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', small: true },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/admin/eventos/${id}`} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 transition-all shadow-sm">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{fornecedor.nome}</h1>
            <p className="text-slate-400 text-sm">{(fornecedor.eventos as any)?.nome}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NovoFuncionarioModal fornecedorId={fid} eventoId={id} empresaPadrao={fornecedor.nome} />
          <CopyLinkButton link={formLink} label="Copiar link do formulário" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map(({ label, value, color, bg, border, small }) => (
          <div key={label} className={`bg-white border ${border} rounded-2xl p-4 text-center shadow-sm`}>
            <p className={`${small ? 'text-lg' : 'text-2xl'} font-bold ${color}`}>{value}</p>
            <p className="text-slate-400 text-xs mt-1 font-medium">{label}</p>
          </div>
        ))}
      </div>

      <FuncionarioTable
        funcionarios={funcionariosEnriquecidos}
        fornecedorId={fid}
        eventoId={id}
      />
    </div>
  )
}
