import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, ehMaster, podeExcluir } from '@/lib/permissions'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ScanLine, Users, AlertTriangle, Wallet, TrendingUp } from 'lucide-react'
import FuncionarioTable, { type Presenca, type StatusEtapa } from './FuncionarioTable'
import StatCard from '@/components/StatCard'
import { Secao, PageHeader } from '@/components/ui/Superficie'
import AutoRefresh from './AutoRefresh'
import { ProgressoEtapas, COR_ETAPA } from '@/components/charts'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

export const revalidate = 0

const TUTORIAL: TutorialConfig = {
  tela: 'setor-equipe',
  versao: 1,
  passos: [
    { alvo: 'setor-scan', titulo: 'Escanear QR', posicao: 'bottom',
      descricao: 'No dia do evento, use aqui para ler o QR Code da equipe na entrada e na saída.' },
    { alvo: 'setor-stats', titulo: 'Situação da equipe', posicao: 'bottom',
      descricao: 'Veja de relance quantos estão presentes, quantos ainda não chegaram e quem está com alguma etapa pendente.' },
    { alvo: 'setor-tabela', titulo: 'Sua equipe', posicao: 'top',
      descricao: 'A lista completa com o status de cada etapa. Verde já registrou, amarelo está na hora e vermelho perdeu a janela. Clique numa pessoa para ver os detalhes.' },
  ],
}

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
      .select('funcionario_id, tipo, created_at, foto_url, latitude, longitude, endereco_aproximado, criado_por_perfil_id, registro_manual, justificativa, funcionarios!inner(fornecedor_id)')
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
      assistido: r.registro_manual === true,
      justificativa: r.justificativa ?? null,
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
  const contar = (t: MomentoTipo) => funcionariosEnriquecidos.filter(f => f[t]).length
  const comPendencia = funcionariosEnriquecidos.filter(f => f.statusEntrada === 'fechado' || f.statusMeio === 'fechado' || f.statusFim === 'fechado').length
  const totalReceber = funcionariosEnriquecidos.reduce((acc, f) => acc + f.valorReceber, 0)
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })


  /* Uma cor por cartão, fixa e diferente entre si: azul, laranja e roxo. */
  const stats = [
    { label: 'Total', value: total, icon: Users, tom: 'info' as const },
    { label: 'Com pendências', value: comPendencia, icon: AlertTriangle, tom: 'aviso' as const },
    {
      label: 'A receber (equipe)',
      value: brl(totalReceber),
      icon: Wallet,
      small: true,
      tom: 'acento' as const,
    },
  ]

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil.role)}>
    <div className="space-y-5">
      <AutoRefresh />
      <PageHeader
        titulo={fornecedor.nome}
        descricao={(fornecedor.eventos as any)?.nome}
        voltarPara={`/admin/eventos/${id}`}
        /* Só o que se usa no dia do evento. Localizar funcionário, cadastro
           manual e cópia do link saíram daqui a pedido: cinco botões na mesma
           fileira quebravam a linha e escondiam o Escanear QR, que é a ação
           do momento. */
        acoes={
          <>
            <TutorialButton />
            <Link href={`/scan?evento=${id}`} data-tutorial="setor-scan" className="btn btn-primario">
              <ScanLine className="w-3.5 h-3.5 shrink-0" /> Escanear QR
            </Link>
          </>
        }
      />

      {/* Três colunas porque são três indicadores. Numa grade de quatro, a
          quarta coluna ficava vazia e sobrava um vão à direita do último
          cartão — parecia que faltava alguma coisa ali. */}
      <div data-tutorial="setor-stats" className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Progresso da equipe por etapa */}
      <Secao
        tom="sucesso"
        icone={<TrendingUp className="w-3.5 h-3.5" />}
        titulo="Progresso da equipe"
        descricao={`Quantos dos ${total} funcionários já registraram cada etapa`}
        corpoClassName="p-5"
      >
        <ProgressoEtapas
          itens={[
            { label: 'Entrada', valor: contar('entrada'), total, cor: COR_ETAPA.entrada },
            { label: 'Meio', valor: contar('meio'), total, cor: COR_ETAPA.meio },
            { label: 'Saída', valor: contar('fim'), total, cor: COR_ETAPA.fim },
          ]}
        />
      </Secao>

      <div data-tutorial="setor-tabela">
        <FuncionarioTable
          funcionarios={funcionariosEnriquecidos}
          fornecedorId={fid}
          eventoId={id}
          valorCombinado={fornecedor.valor_combinado ?? null}
          podeExcluir={podeExcluir(perfil.role)}
        />
      </div>
    </div>
    </TutorialProvider>
  )
}
