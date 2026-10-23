import { redirect } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import { podeEditarIdentidade } from '@/lib/permissions'
import { PageHeader } from '@/components/ui/Superficie'
import ConsultaCpf from './ConsultaCpf'

export const revalidate = 0

/**
 * Consulta por CPF (Juan, 23/10/2026) — tudo o que o sistema sabe de uma pessoa, em todos os eventos: fichas, batidas (e
 * quem lançou cada uma), pausas, o que foi apagado, auditoria e mensagens de WhatsApp. Existe para responder, em segundos,
 * o tipo de reclamação "ele bateu entrada e saída e não consta no sistema" — antes só com script. Só leitura.
 *
 * Master e suporte (a mesma régua de corrigir CPF). A régua de verdade está em `consultarPorCpf`: o suporte só vê os
 * eventos do escopo dele.
 */
export default async function ConsultaCpfPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeEditarIdentidade(perfil)) redirect('/admin')

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Consulta por CPF"
        descricao="Tudo o que o sistema sabe de uma pessoa, em todos os eventos: fichas, batidas e quem lançou cada uma, auditoria e mensagens"
      />
      <ConsultaCpf />
    </div>
  )
}
