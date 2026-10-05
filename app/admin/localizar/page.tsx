import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { UserSearch, CalendarDays } from 'lucide-react'

import { getPerfil, meusSetores, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { podeAcompanhar, ehMaster, podeGerenciarEventos, veTodosEventos } from '@/lib/permissions'
import { suporteTemEscopo } from '@/lib/suporte'
import EscolherEvento, { eventosQuePossoAbrir, eventosDosMeusSetores } from '../EscolherEvento'
import LocalizarFuncionario from './LocalizarFuncionario'
import { PageHeader } from '@/components/ui/Superficie'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

export const revalidate = 0

const TUTORIAL: TutorialConfig = {
  tela: 'localizar-funcionario',
  versao: 1,
  passos: [
    { alvo: 'loc-busca', titulo: 'Ache a pessoa', posicao: 'bottom', icone: 'Search',
      descricao: 'Quando alguém da sua equipe perder o horário de uma batida, você recebe o aviso no WhatsApp, encontra a pessoa e busca por ela aqui — pelo CPF, se tiver o documento em mãos, ou pelo nome. Se aparecer mais de uma pessoa, escolha na lista. Só aparecem pessoas dos fornecedores sob sua responsabilidade.' },
    { alvo: 'loc-ficha', titulo: 'Confira quem é', posicao: 'bottom', icone: 'IdCard',
      descricao: 'Confirme pela foto e pelo nome que é a pessoa certa antes de seguir. O quadro colorido no fim mostra qual batida está faltando — é essa que vai ser registrada.' },
    { alvo: 'loc-foto', titulo: 'Tire a foto do rosto', posicao: 'bottom', icone: 'Camera',
      descricao: 'É a prova de que o colaborador estava na sua frente na hora do registro. Sem essa foto o sistema não deixa registrar, e ela fica guardada junto com a batida para sempre.' },
    { alvo: 'loc-registrar', titulo: 'Registrar', posicao: 'top', icone: 'ClipboardCheck',
      descricao: 'Você não escolhe qual batida gravar: o sistema grava sozinho a que está pendente. Junto ficam o seu nome, o horário, a localização e o aparelho — nada disso pode ser alterado depois.' },
  ],
}

/**
 * Registrar ponto — pede o EVENTO primeiro (pedido do Juan, 05/10/2026,
 * mesmo padrão de Lançamento manual/Bloquear CPF/Relatórios/Meu Crachá):
 * antes a busca cruzava TODOS os eventos acontecendo hoje de uma vez só,
 * sem perguntar qual — confuso pra quem opera mais de um evento ao mesmo
 * tempo (achado testando o próprio CPF, que não aparecia em nenhum porque
 * master não tem ficha de funcionário em evento nenhum). Ver
 * `localizarFuncionario` em lib/actions.ts, que agora recebe o eventoId e
 * escopa a busca só a ele.
 */
export default async function LocalizarPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeAcompanhar(perfil)) redirect('/admin')

  const meusVinculos = await meusSetores(perfil)
  const { evento: eventoParam } = await searchParams

  if (!eventoParam) {
    /*
     * Quem só tem vínculo (sem ser admin/master/suporte) vê a lista ESTRITA
     * dos próprios setores — `eventosQuePossoAbrir` daria o escopo largo da
     * organização, que não é o dela de verdade pra registrar ponto.
     */
    const eventos = (podeGerenciarEventos(perfil) || perfil.role === 'supervisor' || perfil.role === 'suporte')
      ? await eventosQuePossoAbrir()
      : await eventosDosMeusSetores(meusVinculos)
    return (
      <div className="max-w-xl mx-auto space-y-5">
        <PageHeader titulo="Registrar ponto" descricao="Escolha o evento — a busca é só dentro dele" />
        <EscolherEvento
          eventos={eventos}
          href={id => `/admin/localizar?evento=${id}`}
          icone={<UserSearch className="w-3.5 h-3.5" />}
          titulo="Em qual evento?"
          descricao="Busque por CPF ou nome de quem perdeu o horário, com foto na hora"
          vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para poder registrar ponto nele.' }}
          mostrarOrganizacao={veTodosEventos(perfil)}
        />
      </div>
    )
  }

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoParam).single()
  if (!evento) notFound()

  /*
   * Mesma régua de Lançamento manual: vínculo (papel supervisor ou outro
   * papel que ganhou um) neste evento libera; senão, cai pra suporte/escopo
   * largo de admin-master.
   */
  const temVinculoNesteEvento = meusVinculos.some(s => s.evento_id === eventoParam)
  if (temVinculoNesteEvento) {
    // liberado
  } else if (perfil.role === 'supervisor') {
    notFound()
  } else if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined }))) notFound()
  } else if (!veTodosEventos(perfil) && evento.organizacao_id !== perfil.organizacao_id) {
    notFound()
  }

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil.role)}>
      {/*
        Coluna estreita, mas ancorada no topo à esquerda como todas as outras
        telas. Centralizar no meio da tela deixava o conteúdo boiando num vazio
        enorme em monitor grande — o campo de busca é o começo da tarefa e tem
        que estar onde o olho já está, que é no canto superior esquerdo.
      */}
      <div className="max-w-xl mx-auto space-y-5">
        <PageHeader
          titulo="Registrar ponto"
          descricao={`${evento.nome} — busca por CPF ou nome, com foto na hora`}
          acoes={
            <>
              <Link href="/admin/localizar" className="btn btn-secundario">
                <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
              </Link>
              <TutorialButton />
            </>
          }
        />
        <LocalizarFuncionario eventoId={eventoParam} />
      </div>
    </TutorialProvider>
  )
}
