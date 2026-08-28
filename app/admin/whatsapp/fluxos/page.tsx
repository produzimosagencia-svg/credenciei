import { Workflow } from 'lucide-react'
import { FLUXOS, fluxosAtivos } from '@/lib/whatsapp-painel'
import { Secao, Aviso } from '@/components/ui/Superficie'
import FormFluxos from './FormFluxos'

export const revalidate = 0

/**
 * Quais avisos automáticos estão ligados.
 *
 * Serve para o caso concreto que já aconteceu: um template ainda não aprovado,
 * ou um tipo de aviso saindo errado. Desligar aqui para o disparo na hora, sem
 * deploy e sem mexer na fila.
 */
export default async function FluxosPage() {
  const ativos = await fluxosAtivos()

  return (
    <div className="space-y-4">
      <Aviso tom="marca" icone={<Workflow className="w-3.5 h-3.5" />}>
        Só o que estiver ligado aqui é agendado. Desligar não apaga o que já está na fila —
        interrompe o agendamento de novas mensagens daquele tipo.
      </Aviso>

      <Secao
        tom="neutro"
        icone={<Workflow className="w-3.5 h-3.5" />}
        titulo="Disparos automáticos"
        descricao="Cada um dispara sozinho, no momento indicado"
        corpoClassName="p-4"
      >
        <FormFluxos fluxos={FLUXOS} ativos={ativos} />
      </Secao>
    </div>
  )
}
