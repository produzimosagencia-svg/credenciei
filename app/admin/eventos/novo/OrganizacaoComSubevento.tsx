'use client'
import { useState } from 'react'
import SeletorLista from '@/components/SeletorLista'

/**
 * Organização dona do evento (só o master vê isto) + o checkbox "Este
 * evento possui subeventos" — pedido do Juan (01/10/2026): antes só dava
 * pra ligar subeventos DEPOIS de criar o evento, em Editar evento. Aqui já
 * nasce ligado, sem o passo extra.
 *
 * Precisa ser client porque o checkbox só faz sentido pra organizações que
 * já liberaram "Subeventos" em Configurações — e, pro master, a organização
 * só é conhecida depois de escolhida neste `<select>` (o admin comum nem
 * vê este campo: a organização dele já é fixa, ver `page.tsx`).
 */
export default function OrganizacaoComSubevento({
  organizacoes, organizacoesComSubeventos,
}: {
  organizacoes: { id: string; nome: string; ativo: boolean }[]
  /** Quais organizações já ligaram "Subeventos" em Configurações. */
  organizacoesComSubeventos: Record<string, boolean>
}) {
  const [orgId, setOrgId] = useState('')

  return (
    <>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Organização dona do evento *</label>
        <SeletorLista
          name="organizacao_id"
          required
          valor={orgId}
          onChange={setOrgId}
          placeholder="Escolha o cliente…"
          titulo="Organização"
          opcoes={organizacoes.map(o => ({
            valor: o.id,
            rotulo: o.nome,
            detalhe: o.ativo ? undefined : 'Suspensa',
            desabilitada: !o.ativo,
          }))}
        />
        <p className="text-slate-500 text-xs mt-1.5">
          É quem vai enxergar e operar este evento. Sem dono, o evento não aparece pra nenhum administrador.
        </p>
      </div>

      {!!organizacoesComSubeventos[orgId] && (
        <label
          htmlFor="tem_subeventos"
          className="block bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-brand-300 transition-colors"
        >
          <input type="hidden" name="tem_subeventos_presente" value="1" />
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="tem_subeventos"
              name="tem_subeventos"
              className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-brand-500 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-slate-800 font-semibold text-sm">Este evento possui subeventos</p>
              <p className="text-slate-600 text-xs mt-1">
                Portões/categorias de acesso diferentes no mesmo evento (ex.: Camarote,
                Arquibancada, Pista). Ligado, cada fornecedor nasce DENTRO de um subevento, não
                mais direto no evento.
              </p>
            </div>
          </div>
        </label>
      )}
    </>
  )
}
