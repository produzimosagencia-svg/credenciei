import { redirect } from 'next/navigation'
import Documento from '@/components/relatorio-doc/Documento'
import Folhas from '@/components/relatorio-doc/Folhas'
import { paginar, carimboDoSistema } from '@/lib/relatorio-doc'
import { exigirAcessoAoEvento } from '@/lib/relatorios-acesso'
import { dadosEntregaValor } from '@/lib/entrega-valor'
import { montarEntregaValorDoc } from '@/lib/relatorio-doc-entrega'

export const revalidate = 0

/** O PDF de entrega de valor no padrão do modelo. Só para quem gerencia o evento inteiro (vai para o cliente). */
export default async function EntregaValorPdf({ params }: { params: Promise<{ eventoId: string }> }) {
  const { eventoId } = await params
  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) {
    if (acesso.erro === 'Não autenticado.') redirect('/login')
    return <p style={{ padding: 32, fontFamily: 'system-ui' }}>{acesso.erro}</p>
  }
  if (acesso.setoresPermitidos) return <p style={{ padding: 32, fontFamily: 'system-ui' }}>O relatório de entrega de valor é só para quem gerencia o evento inteiro.</p>
  const dados = await dadosEntregaValor(eventoId)
  if (!dados) return <p style={{ padding: 32, fontFamily: 'system-ui' }}>Evento não encontrado.</p>
  const rotulo = [dados.eventoNome, dados.organizacaoNome].filter(Boolean).join(' · ')
  return (
    <Documento nomeArquivo={`Entrega de valor - ${dados.eventoNome}`}>
      <Folhas folhas={paginar(montarEntregaValorDoc(dados))} rotuloEvento={rotulo} carimbo={carimboDoSistema()} />
    </Documento>
  )
}
