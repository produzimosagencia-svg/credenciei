import { supabaseAdmin } from '@/lib/supabase-server'
import { numerosWhatsApp, templatesAprovados } from '@/lib/whatsapp-painel'
import { PageHeader, Aviso } from '@/components/ui/Superficie'
import FormAvulso from './FormAvulso'

export const revalidate = 0

/**
 * Envio avulso: planilha de contatos, template aprovado, e o status daquele
 * envio na mesma tela.
 *
 * Separado de "Novo disparo" porque o público é outro: lá a lista sai da
 * equipe cadastrada do evento, filtrada por setor; aqui vem de uma planilha
 * que alguém montou fora do sistema, para um envio que não se repete.
 *
 * A proteção de master vem do layout da seção, não daqui.
 */
export default async function AvulsoPage() {
  const [{ data: eventos }, numeros, templates] = await Promise.all([
    supabaseAdmin.from('eventos').select('id, nome, data_inicio')
      .order('data_inicio', { ascending: false }).limit(50),
    numerosWhatsApp(),
    templatesAprovados(),
  ])

  // Autenticação é outro bicho: o botão "copiar código" exige um parâmetro
  // próprio e o template não serve pra avisar ninguém sobre evento.
  const aprovados = templates
    .filter(t => t.status === 'APPROVED' && t.categoria !== 'AUTHENTICATION')
    .map(t => ({ nome: t.nome, variaveis: t.variaveis, corpo: t.corpo, categoria: t.categoria, cabecalho: t.cabecalho }))

  const semNumero = !numeros.some(n => n.status === 'CONNECTED')

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Envio avulso"
        descricao="Sobe a planilha, escolhe o template e acompanha aquele envio do começo ao fim"
      />

      {semNumero && (
        <Aviso tom="erro">
          Nenhum número conectado na conta da Meta. Sem isso o envio não sai.
        </Aviso>
      )}
      {aprovados.length === 0 && (
        <Aviso tom="erro">
          Nenhum template aprovado disponível. Fora da janela de 24 horas, a Meta só entrega template aprovado.
        </Aviso>
      )}

      <FormAvulso
        eventos={(eventos ?? []).map(e => ({ id: e.id as string, nome: e.nome as string }))}
        numeros={numeros.map(n => ({ id: n.id, numero: n.numero, nome: n.nome, status: n.status }))}
        templates={aprovados}
      />
    </div>
  )
}
