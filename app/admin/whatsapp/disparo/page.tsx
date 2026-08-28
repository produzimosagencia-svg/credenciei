import { redirect } from 'next/navigation'
import { Send } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase-server'
import { templatesAprovados } from '@/lib/whatsapp-painel'
import { Secao, Aviso } from '@/components/ui/Superficie'
import FormDisparo from './FormDisparo'

export const revalidate = 0

/**
 * Disparo em massa.
 *
 * A tela inteira gira em torno de uma coisa: ver quem vai receber ANTES de
 * mandar. Mil mensagens saem em minutos e não voltam, e a diferença entre
 * acertar o setor e acertar o evento inteiro é um clique.
 */
export default async function DisparoPage() {
  const [{ data: eventos }, templates] = await Promise.all([
    supabaseAdmin.from('eventos').select('id, nome, ativo, data_inicio').order('data_inicio', { ascending: false }).limit(50),
    templatesAprovados(),
  ])
  const { data: setores } = await supabaseAdmin.from('fornecedores').select('id, nome, evento_id')

  const aprovados = templates.filter(t => t.status === 'APPROVED')
  if (!eventos?.length) redirect('/admin')

  return (
    <div className="space-y-4">
      <Aviso tom="atencao" icone={<Send className="w-3.5 h-3.5" />}>
        O disparo entra na <strong>mesma fila</strong> dos avisos automáticos — com espaçamento entre
        envios e as travas contra mensagem errada. Não sai tudo de uma vez de propósito: é isso que
        evita o número ser marcado como robô.
      </Aviso>

      <Secao tom="acento" icone={<Send className="w-3.5 h-3.5" />} titulo="Disparar para uma equipe"
        descricao="Escolha o evento, o setor e o template aprovado" corpoClassName="p-4">
        {!aprovados.length ? (
          <p className="text-slate-500 text-sm">
            Nenhum template aprovado foi encontrado. Confira <code>WHATSAPP_TOKEN</code> e{' '}
            <code>WHATSAPP_BUSINESS_ACCOUNT_ID</code> na Vercel — sem eles não dá para ler a lista.
          </p>
        ) : (
          <FormDisparo
            eventos={(eventos ?? []).map(e => ({ id: e.id, nome: e.nome, ativo: e.ativo !== false }))}
            setores={(setores ?? []).map(s => ({ id: s.id, nome: s.nome, eventoId: s.evento_id as string }))}
            templates={aprovados.map(t => ({ nome: t.nome, variaveis: t.variaveis, corpo: t.corpo }))}
          />
        )}
      </Secao>
    </div>
  )
}
