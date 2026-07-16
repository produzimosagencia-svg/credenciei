import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos } from '@/lib/permissions'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ScanLine, Users, UserCheck, AlertTriangle, Wallet } from 'lucide-react'
import FuncionarioTable, { type Presenca, type StatusEtapa } from './FuncionarioTable'
import CopyLinkButton from '../../CopyLinkButton'
import NovoFuncionarioModal from './NovoFuncionarioModal'
import RegistroManualModal from './RegistroManualModal'
import StatCard from '@/components/StatCard'
import AutoRefresh from './AutoRefresh'

export const revalidate = 0

type MomentoTipo = 'entrada' | 'meio' | 'fim'

function statusEtapa(presenca: Presenca, inicio: string | null, fim: string | null): StatusEtapa {
  if (presenca) return 'feito'
  if (!inicio || !fim) return 'indefinido'
  const agora = Date.now()
  if (agora < new Date(inicio).getTime()) return 'indefinido'
  if (agora > new Date(fim).getTime()) return 'fechado'
  return 'aberto'
}

export default async function FornecedorPage({ params }: { params: Promise<{ id: string; fid: string }> }) {
  const { id, fid } = await params

  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const [{ data: fornecedor }, { data: funcionarios }, { data: registros }, { data: evento }] = await Promise.all([
    supabase.from('fornecedores').select('*, eventos(nome, organizacao_id)').eq('id', fid).single(),
    supabase.from('funcionarios').select('id, nome, cpf, telefone, empresa, cargo, qr_token, valor_receber, foto_perfil_path, chave_pix, pago, pago_em, ativo').eq('fornecedor_id', fid).order('nome'),
    supabase
      .from('registros')
      .select('funcionario_id, tipo, created_at, foto_url, latitude, longitude, endereco_aproximado, criado_por_perfil_id, funcionarios!inner(fornecedor_id)')
      .eq('evento_id', id)
      .eq('funcionarios.fornecedor_id', fid)
      .in('tipo', ['entrada', 'meio', 'fim']),
    supabase
      .from('eventos')
      .select('janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim')
      .eq('id', id)
      .single(),
  ])

  if (!fornecedor) notFound()

  // Isolamento: supervisor só vê o PRÓPRIO setor; demais papéis, só a própria organização
  const organizacaoDoEvento = (fornecedor.eventos as any)?.organizacao_id
  if (perfil.role === 'supervisor') {
    if (perfil.fornecedor_id !== fid) notFound()
  } else if (!veTodosEventos(perfil.role) && organizacaoDoEvento !== perfil.organizacao_id) {
    notFound()
  }

  // Nomes dos supervisores que fizeram os registros de QR (entrada/saída)
  const perfilIds = [...new Set((registros ?? []).map(r => r.criado_por_perfil_id).filter((v): v is string => !!v))]
  const nomePorPerfil: Record<string, string> = {}
  if (perfilIds.length) {
    const { data: perfis } = await supabase.from('perfis').select('id, nome').in('id', perfilIds)
    for (const p of perfis ?? []) nomePorPerfil[p.id] = p.nome
  }

  // Assina as URLs das fotos em lote (bucket privado) — presença + avatares
  const fotosPresenca = (registros ?? []).map(r => r.foto_url).filter((p): p is string => !!p)
  const fotosAvatar = (funcionarios ?? []).map(f => f.foto_perfil_path).filter((p): p is string => !!p)
  const urlPorPath: Record<string, string> = {}
  const todosPaths = [...fotosPresenca, ...fotosAvatar]
  if (todosPaths.length) {
    const { data: signed } = await supabase.storage.from('presencas').createSignedUrls(todosPaths, 60 * 60)
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
      enderecoAproximado: r.endereco_aproximado ?? null,
      registradoPor: r.criado_por_perfil_id ? nomePorPerfil[r.criado_por_perfil_id] ?? null : null,
    }
  }

  const funcionariosEnriquecidos = (funcionarios ?? []).map(f => {
    const entrada = presencaPorFunc[f.id]?.entrada ?? null
    const meio = presencaPorFunc[f.id]?.meio ?? null
    const fim = presencaPorFunc[f.id]?.fim ?? null
    return {
      id: f.id,
      nome: f.nome,
      cpf: f.cpf,
      telefone: f.telefone,
      empresa: f.empresa ?? '',
      cargo: f.cargo ?? '',
      qr_token: f.qr_token,
      valorReceber: f.valor_receber ?? 0,
      chavePix: f.chave_pix ?? null,
      pago: f.pago ?? false,
      pagoEm: f.pago_em ?? null,
      ativo: f.ativo ?? true,
      fotoUrl: f.foto_perfil_path ? urlPorPath[f.foto_perfil_path] ?? null : null,
      entrada,
      meio,
      fim,
      statusEntrada: statusEtapa(entrada, evento?.janela_entrada_inicio ?? null, evento?.janela_entrada_fim ?? null),
      statusMeio: statusEtapa(meio, evento?.janela_meio_inicio ?? null, evento?.janela_meio_fim ?? null),
      statusFim: statusEtapa(fim, evento?.janela_fim_inicio ?? null, evento?.janela_fim_fim ?? null),
    }
  })

  const total = funcionariosEnriquecidos.length
  const ativados = funcionariosEnriquecidos.filter(f => f.ativo).length
  const teto = fornecedor.quantidade_estimada as number | null
  const contar = (t: MomentoTipo) => funcionariosEnriquecidos.filter(f => f[t]).length
  const comPendencia = funcionariosEnriquecidos.filter(f => f.statusEntrada === 'fechado' || f.statusMeio === 'fechado' || f.statusFim === 'fechado').length
  const totalReceber = funcionariosEnriquecidos.reduce((acc, f) => acc + f.valorReceber, 0)
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const formLink = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/form/${fornecedor.token_formulario}`

  const stats = [
    { label: 'Total', value: total, icon: Users, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
    { label: teto ? `Ativados (teto ${teto})` : 'Ativados', value: ativados, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { label: 'Bateram meio', value: contar('meio'), icon: UserCheck, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Bateram saída', value: contar('fim'), icon: UserCheck, color: 'text-brand-600', bg: 'bg-brand-50', border: 'border-brand-200' },
    { label: 'Com pendências', value: comPendencia, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    { label: 'A receber (equipe)', value: brl(totalReceber), icon: Wallet, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', small: true },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <AutoRefresh />
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
          <Link
            href={`/scan?evento=${id}`}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-all shadow-md shadow-green-200 font-bold"
          >
            <ScanLine className="w-4 h-4" /> Escanear QR
          </Link>
          <RegistroManualModal fornecedorId={fid} eventoId={id} />
          <NovoFuncionarioModal fornecedorId={fid} eventoId={id} empresaPadrao={fornecedor.nome} />
          <CopyLinkButton link={formLink} label="Copiar link do formulário" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <FuncionarioTable
        funcionarios={funcionariosEnriquecidos}
        fornecedorId={fid}
        eventoId={id}
        valorCombinado={fornecedor.valor_combinado ?? null}
      />
    </div>
  )
}
