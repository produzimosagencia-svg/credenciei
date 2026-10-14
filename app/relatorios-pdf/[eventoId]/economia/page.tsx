import { redirect } from 'next/navigation'
import Documento from '@/components/relatorio-doc/Documento'
import Folhas from '@/components/relatorio-doc/Folhas'
import CapaEconomia from '@/components/relatorio-doc/CapaEconomia'
import { paginar, carimboDoSistema, plural } from '@/lib/relatorio-doc'
import { exigirAcessoAoEvento } from '@/lib/relatorios-acesso'
import { dadosEconomiaFaltas } from '@/lib/economia-faltas'
import { montarEconomiaDoc, brl } from '@/lib/relatorio-doc-economia'

export const revalidate = 0

/**
 * Economia com faltas em PDF (docs/economia-faltas-vital.pdf, Juan, 14/10/2026). Vai para o cliente: só para quem
 * gerencia o evento inteiro, como a Entrega de valor. A logo do evento na capa vem do navegador (ver CapaEconomia).
 */
export default async function EconomiaFaltasPdf({ params }: { params: Promise<{ eventoId: string }> }) {
  const { eventoId } = await params
  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) {
    if (acesso.erro === 'Não autenticado.') redirect('/login')
    return <p style={{ padding: 32, fontFamily: 'system-ui' }}>{acesso.erro}</p>
  }
  if (acesso.setoresPermitidos) return <p style={{ padding: 32, fontFamily: 'system-ui' }}>O relatório de economia é só para quem gerencia o evento inteiro.</p>
  const d = await dadosEconomiaFaltas(eventoId)
  if (!d) return <p style={{ padding: 32, fontFamily: 'system-ui' }}>Evento não encontrado.</p>

  const ddmm = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}`
  const rotulo = `${d.eventoNome}${d.periodo ? ` · ${ddmm(d.periodo.de)} a ${ddmm(d.periodo.ate)}` : ''}`
  const folhas = paginar(montarEconomiaDoc(d))
  return (
    <Documento nomeArquivo={`Economia com faltas - ${d.eventoNome}`}>
      <CapaEconomia
        eventoId={eventoId}
        rotulo={rotulo}
        valor={brl(d.economia)}
        frase={`que o ${d.eventoNome} deixou de pagar por ${plural(d.faltaram, 'pessoa cadastrada', 'pessoas cadastradas')} que não ${d.faltaram === 1 ? 'bateu' : 'bateram'} entrada.`}
        cadastrados={d.cadastrados}
        foram={d.foram}
        faltaram={d.faltaram}
      />
      <Folhas folhas={folhas} rotuloEvento={rotulo} carimbo={carimboDoSistema()} paginasAntes={1} />
    </Documento>
  )
}
