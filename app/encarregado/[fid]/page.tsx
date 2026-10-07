import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, LogIn, Camera, LogOut, ClipboardList, Eye, Check, X } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { exigirVinculo, vinculosDoEncarregado, carregarEquipeParaConsulta } from '@/lib/encarregado-consulta'
import { caminhoDoSetor } from '@/lib/encarregado'
import { formatarBR } from '@/lib/tz'
import StatCard from '@/components/StatCard'
import { PageHeader } from '@/components/ui/Superficie'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'
import ListaEquipe from './ListaEquipe'
import AutoRefresh from '@/app/admin/eventos/[id]/fornecedor/[fid]/AutoRefresh'

export const revalidate = 0

/**
 * O tutorial do Encarregado — abre sozinho na primeira visita (o motor já
 * guarda "esta pessoa já viu") e o ícone de ajuda reabre quando quiser. O
 * primeiro passo é o que mais importa: dizer, antes de qualquer outra coisa,
 * que este acesso é de CONSULTA.
 */
const TUTORIAL: TutorialConfig = {
  tela: 'encarregado-equipe',
  versao: 1,
  passos: [
    { alvo: 'enc-limites', titulo: 'Você é Encarregado', posicao: 'bottom', icone: 'ShieldCheck',
      descricao: 'Seu acesso é de CONSULTA. Você está aqui para ajudar o supervisor a acompanhar e organizar a equipe — não para operar. Você vê a equipe do seu setor, mas não registra ponto, não aprova, não edita e não remove ninguém.' },
    { alvo: 'enc-limites', titulo: 'Só o seu setor', posicao: 'bottom', icone: 'Building2',
      descricao: 'O acesso vale somente para o setor em que o supervisor te cadastrou. Os outros setores, subeventos e equipes do evento não aparecem para você, mesmo que existam.' },
    { alvo: 'enc-resumo', titulo: 'Como a equipe está', posicao: 'bottom', icone: 'Users',
      descricao: 'Quantos já chegaram, quantos fizeram a batida do meio e quantos já saíram hoje. A tela se atualiza sozinha.' },
    { alvo: 'enc-busca', titulo: 'Procure alguém', posicao: 'bottom', icone: 'Search',
      descricao: 'Busque pelo nome ou pela função, e use os filtros para ver só quem já chegou, quem ainda falta ou quem aguarda aprovação.' },
    { alvo: 'enc-lista', titulo: 'A equipe', posicao: 'top', icone: 'ClipboardCheck',
      descricao: 'Cada pessoa mostra o horário de entrada, do meio e da saída do dia. Precisou de algo que não é consulta? Fale com o seu supervisor — é ele quem faz.' },
  ],
}

export default async function EquipeDoEncarregado({ params }: { params: Promise<{ fid: string }> }) {
  const { fid } = await params
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  // A trava do escopo: sem vínculo VÁLIDO com ESTE setor, a página nem existe.
  const vinculo = await exigirVinculo(perfil.id as string, fid)
  if (!vinculo) notFound()

  const [equipe, todosOsVinculos] = await Promise.all([
    carregarEquipeParaConsulta(vinculo),
    vinculosDoEncarregado(perfil.id as string),
  ])
  const { resumo } = equipe
  const irmaos = todosOsVinculos.filter(v => v.eventoId === vinculo.eventoId)
  const eventos = new Set(todosOsVinculos.map(v => v.eventoId))

  return (
    <TutorialProvider tutorial={TUTORIAL}>
      <div className="space-y-5">
        <AutoRefresh />
        <PageHeader
          titulo={vinculo.setor}
          descricao={caminhoDoSetor({ evento: vinculo.evento, subevento: vinculo.subevento, setor: '' }) || vinculo.evento}
          // Trocar de evento (só quando há mais de um) — o setor se troca nos chips logo abaixo.
          voltarPara={eventos.size > 1 ? '/encarregado' : undefined}
          acoes={<TutorialButton />}
        />

        {/* Os outros setores do MESMO evento em que ele foi designado — a troca é só entre os dele. */}
        {irmaos.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {irmaos.map(v => (
              <Link
                key={v.vinculoId} href={`/encarregado/${v.fornecedorId}`}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  v.fornecedorId === fid ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
                }`}
              >
                {v.subevento ? `${v.subevento} › ` : ''}{v.setor}
              </Link>
            ))}
          </div>
        )}

        <div data-tutorial="enc-limites" className="rounded-2xl border border-brand-200 bg-brand-50 p-4 space-y-3">
          <p className="flex items-center gap-2 text-brand-700 text-sm font-extrabold">
            <Eye className="w-4 h-4 shrink-0" /> Acesso de consulta
          </p>
          <p className="text-brand-900/80 text-xs leading-relaxed">
            Você ajuda o supervisor a acompanhar a equipe deste setor. Aqui você só <strong>vê</strong> — as ações ficam com o supervisor.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-green-700 font-bold mb-1">Você pode</p>
              <ul className="space-y-1 text-slate-600">
                <li className="flex gap-1.5"><Check className="w-3.5 h-3.5 text-green-600 shrink-0 mt-px" />Ver a equipe do seu setor</li>
                <li className="flex gap-1.5"><Check className="w-3.5 h-3.5 text-green-600 shrink-0 mt-px" />Ver quem já chegou e quem falta</li>
              </ul>
            </div>
            <div>
              <p className="text-red-700 font-bold mb-1">Você não pode</p>
              <ul className="space-y-1 text-slate-600">
                <li className="flex gap-1.5"><X className="w-3.5 h-3.5 text-red-500 shrink-0 mt-px" />Registrar ponto, aprovar ou editar</li>
                <li className="flex gap-1.5"><X className="w-3.5 h-3.5 text-red-500 shrink-0 mt-px" />Ver outros setores ou equipes</li>
              </ul>
            </div>
          </div>
        </div>

        <div data-tutorial="enc-resumo" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Na equipe" value={resumo.aprovados} sub={resumo.pendentes ? `${resumo.pendentes} aguardando aprovação` : 'aprovados'} icon={Users} tom="info" />
          <StatCard label="Já chegaram" value={`${resumo.presentes}/${resumo.aprovados}`} sub="entrada de hoje" icon={LogIn} tom="sucesso" />
          <StatCard label="Meio" value={`${resumo.meio}/${resumo.aprovados}`} sub="batida do meio" icon={Camera} tom="info" />
          <StatCard label="Saídas" value={`${resumo.saidas}/${resumo.aprovados}`} sub="já saíram" icon={LogOut} tom="aviso" />
        </div>

        <div className="flex items-center gap-1.5 text-slate-400 text-2xs">
          <ClipboardList className="w-3 h-3" />
          Dia de trabalho {formatarBR(`${equipe.dia}T12:00:00-03:00`, 'data')}
        </div>

        <div data-tutorial="enc-lista">
          <ListaEquipe pessoas={equipe.pessoas} veContato={equipe.veContato} />
        </div>

        <p className="text-center text-slate-300 text-2xs pt-2">
          <Link href="/login" className="hover:text-slate-400">Credenciei</Link>
        </p>
      </div>
    </TutorialProvider>
  )
}
