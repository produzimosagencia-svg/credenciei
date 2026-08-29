import Link from 'next/link'
import { CheckCircle2, XCircle, AlertTriangle, FileText, Send, MessagesSquare, Gauge, CircleDollarSign } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase-server'
import { estadoDaInstancia, provedor } from '@/lib/whatsapp'
import { resumoFinanceiroWhatsApp, templatesAprovados } from '@/lib/whatsapp-painel'
import { formatarBR } from '@/lib/tz'
import { Secao, Badge, Aviso, EmptyState } from '@/components/ui/Superficie'
import StatCard from '@/components/StatCard'

export const revalidate = 0

/**
 * Visão geral do canal.
 *
 * Responde de cima para baixo as perguntas que se faz antes de disparar
 * qualquer coisa: o canal está de pé, quais templates posso usar, e o que saiu
 * hoje. Sem isso, um disparo em massa vira aposta.
 */
export default async function WhatsAppPage() {
  const [canal, templates] = await Promise.all([estadoDaInstancia(), templatesAprovados()])
  const financeiro = await resumoFinanceiroWhatsApp(templates)

  const hoje = new Date()
  hoje.setUTCHours(3, 0, 0, 0) // 00:00 em Brasília

  const [{ count: enviadasHoje }, { count: falhasHoje }, { count: fila }, { data: recentes }] = await Promise.all([
    supabaseAdmin.from('mensagens_log').select('id', { count: 'exact', head: true })
      .eq('status', 'sucesso').gte('criado_em', hoje.toISOString()),
    supabaseAdmin.from('mensagens_log').select('id', { count: 'exact', head: true })
      .eq('status', 'erro').gte('criado_em', hoje.toISOString()),
    supabaseAdmin.from('mensagens_agendadas').select('id', { count: 'exact', head: true })
      .eq('status', 'pendente'),
    supabaseAdmin.from('mensagens_log').select('criado_em, tipo, status, destinatario_telefone, erro')
      .order('criado_em', { ascending: false }).limit(8),
  ])

  const aprovados = templates.filter(t => t.status === 'APPROVED')
  const pendentes = templates.filter(t => t.status === 'PENDING')
  const rejeitados = templates.filter(t => t.status === 'REJECTED')
  const pausado = process.env.WHATSAPP_PAUSADO === 'true'

  return (
    <div className="space-y-5">
      {/* O que impede o canal de funcionar vem primeiro — antes dos números,
          porque número bonito com a fila pausada engana. */}
      {pausado && (
        <Aviso tom="atencao" icone={<AlertTriangle className="w-3.5 h-3.5" />}>
          <strong>Envio pausado.</strong> A variável <code>WHATSAPP_PAUSADO</code> está ligada:
          a fila acumula e nada sai. Desligue quando quiser voltar a enviar.
        </Aviso>
      )}
      {!canal.conectada && (
        <Aviso tom="erro" icone={<XCircle className="w-3.5 h-3.5" />}>
          <strong>Canal fora do ar.</strong> {canal.estado}
        </Aviso>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Enviadas hoje" value={enviadasHoje ?? 0} icon={Send} tom="sucesso" />
        <StatCard label="Falhas hoje" value={falhasHoje ?? 0} icon={XCircle} tom={falhasHoje ? 'erro' : 'neutro'} />
        <StatCard label="Na fila" value={fila ?? 0} icon={MessagesSquare} tom="info" />
        <StatCard label="Templates aprovados" value={aprovados.length} icon={FileText} tom="acento" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Mensagens disparadas"
          value={financeiro.enviados}
          sub="Total enviado no histórico do canal"
          icon={Send}
          tom="info"
        />
        <StatCard
          label="Custo aproximado"
          value={financeiro.custoEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          sub={`${financeiro.porCategoria.AUTHENTICATION.enviados} autenticação · ${financeiro.porCategoria.MARKETING.enviados} marketing · ${financeiro.porCategoria.UTILITY.enviados} utilidade`}
          icon={CircleDollarSign}
          tom="aviso"
          small
        />
      </div>

      <Secao
        tom={canal.conectada ? 'sucesso' : 'aviso'}
        icone={<Gauge className="w-3.5 h-3.5" />}
        titulo="Estado do canal"
        descricao={provedor() === 'meta' ? 'API oficial da Meta (Cloud API)' : 'Evolution — WhatsApp Web automatizado'}
        acoes={canal.conectada
          ? <Badge tom="positivo">No ar</Badge>
          : <Badge tom="negativo">Fora do ar</Badge>}
        corpoClassName="p-4 space-y-2"
      >
        <p className="text-slate-600 text-sm">{canal.estado}</p>
        {provedor() !== 'meta' && (
          <p className="text-slate-500 text-xs">
            A Evolution automatiza o WhatsApp Web e já derrubou este número duas vezes. Para volume,
            o caminho é a API oficial — ajuste <code>WHATSAPP_PROVEDOR=meta</code>.
          </p>
        )}
      </Secao>

      <Secao
        tom="neutro"
        icone={<FileText className="w-3.5 h-3.5" />}
        titulo="Templates"
        descricao="Lidos direto da Meta — é o texto que a pessoa recebe, não o que está no código"
        acoes={
          <div className="flex gap-1.5">
            {!!pendentes.length && <Badge tom="atencao">{pendentes.length} em análise</Badge>}
            {!!rejeitados.length && <Badge tom="negativo">{rejeitados.length} rejeitados</Badge>}
          </div>
        }
      >
        {!templates.length ? (
          <EmptyState
            icone={<FileText className="w-7 h-7" />}
            titulo="Nenhum template encontrado"
            descricao="Confira WHATSAPP_TOKEN e WHATSAPP_BUSINESS_ACCOUNT_ID — sem eles não dá para ler a lista."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr><th>Template</th><th>Status</th><th>Categoria</th><th>Variáveis</th><th>Começa com</th></tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.nome}>
                    <td className="font-medium text-slate-800">{t.nome}</td>
                    <td>
                      {t.status === 'APPROVED' ? <Badge tom="positivo">Aprovado</Badge>
                        : t.status === 'PENDING' ? <Badge tom="atencao">Em análise</Badge>
                        : <Badge tom="negativo">{t.status}</Badge>}
                    </td>
                    <td className="text-slate-500 text-xs">{t.categoria}</td>
                    <td className="text-slate-500 tabular-nums">{t.variaveis}</td>
                    <td className="text-slate-500 text-xs max-w-md truncate">{t.corpo.split('\n')[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao
        tom="info"
        icone={<CheckCircle2 className="w-3.5 h-3.5" />}
        titulo="Últimos envios"
        descricao="Cada tentativa registrada, com o motivo quando falha"
      >
        {!recentes?.length ? (
          <EmptyState icone={<Send className="w-7 h-7" />} titulo="Nada enviado ainda" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Quando</th><th>Tipo</th><th>Para</th><th>Resultado</th></tr></thead>
              <tbody>
                {recentes.map((l, i) => (
                  <tr key={i}>
                    <td className="text-slate-500 tabular-nums">{formatarBR(l.criado_em as string, 'curto')}</td>
                    <td className="text-slate-600 text-xs">{l.tipo}</td>
                    <td className="text-slate-500 tabular-nums text-xs">{l.destinatario_telefone}</td>
                    <td>
                      {l.status === 'sucesso'
                        ? <Badge tom="positivo">Enviada</Badge>
                        : <span className="text-erro-600 text-xs">{String(l.erro ?? 'falhou').slice(0, 70)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <p className="text-slate-500 text-xs">
        Para criar uma campanha, use{' '}
        <Link href="/admin/whatsapp/disparo" className="text-brand-500 hover:underline">Novo disparo</Link>.
      </p>
    </div>
  )
}
