import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { Secao } from '@/components/ui/Superficie'
import type { BatidaForaDoLocal } from '@/lib/alertas-local'
import { formatarBR } from '@/lib/tz'

const ROTULO: Record<string, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

/**
 * O alerta de hoje: quem bateu fora do raio do local do evento (lib/alertas-local.ts). Só admin/master veem — é
 * conferência interna, nunca aparece para o colaborador. Some sozinho quando não há nada a alertar.
 */
export default function AlertaForaDoLocal({ eventoId, batidas }: { eventoId: string; batidas: BatidaForaDoLocal[] }) {
  if (!batidas.length) return null
  return (
    <Secao
      tom="aviso"
      icone={<MapPin className="w-3.5 h-3.5" />}
      titulo={`${batidas.length} batida${batidas.length === 1 ? '' : 's'} fora do local hoje`}
      descricao="O aparelho de quem registrou estava fora do raio configurado em Editar evento. A batida vale do mesmo jeito — isto é só para conferência."
      corpoClassName="p-0"
    >
      <ul className="divide-y divide-slate-100">
        {batidas.slice(0, 8).map(b => (
          <li key={b.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="font-semibold text-slate-800">{b.nome}</span>
              {b.setorNome && <span className="text-slate-500"> · {b.setorNome}</span>}
              <span className="text-slate-500"> · {ROTULO[b.tipo] ?? b.tipo}</span>
            </span>
            <span className="text-amber-700 text-xs font-medium whitespace-nowrap">
              {formatarBR(b.criadoEm, 'hora')}{b.distanciaTexto ? ` · ${b.distanciaTexto}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {batidas.length > 8 && (
        <p className="text-slate-400 text-xs px-4 py-2 border-t border-slate-100">
          E mais {batidas.length - 8}. <Link href={`/admin/eventos/${eventoId}/presenca`} className="text-brand-600 hover:underline">Ver presença do dia</Link>
        </p>
      )}
    </Secao>
  )
}
