import { getPerfil, eventosEscaneaveis, meuSetor, supabaseAdmin } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { podeEscanear, podeGerenciarEventos, podeAcompanhar } from '@/lib/permissions'
import ScannerRouter from './ScannerRouter'
import { QrCode, Users, ClipboardCheck } from 'lucide-react'
import Link from 'next/link'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import { ehMaster } from '@/lib/permissions'
import type { TutorialConfig } from '@/components/tutorial/types'

// Esta tela vai mudar quando o leitor for reformulado. O roteiro fica isolado
// aqui: pra atualizar depois, basta reescrever os passos e subir a `versao` —
// quem já tinha visto o tutorial antigo vê o novo automaticamente.
const TUTORIAL: TutorialConfig = {
  tela: 'scan',
  // Versão 3: o botão Entrada/Saída voltou (26/09/2026) — quem já tinha visto
  // o tutorial anterior vê o roteiro novo automaticamente.
  versao: 3,
  passos: [
    { alvo: 'scan-evento', titulo: 'Evento', posicao: 'bottom', icone: 'ListChecks',
      descricao: 'Confirme que é o evento certo antes de começar. Se você é supervisor, só aparece o evento do seu fornecedor — não tem como escanear no evento errado.' },
    { alvo: 'scan-modo', titulo: 'Entrada ou saída', posicao: 'bottom', icone: 'ScanLine',
      descricao: 'Escolha o que está registrando: ENTRADA (verde) ou SAÍDA (azul). Fica escolhido até você trocar. Quem saiu e está voltando: ENTRADA — a saída fica no histórico. Se escolher errado, nada é gravado errado: a tela avisa.' },
    { alvo: 'scan-camera', titulo: 'A leitura', posicao: 'top', icone: 'ScanLine',
      descricao: 'Aponte para o QR Code na tela do celular da pessoa. Aparece o nome e o que vai ser registrado: confira e toque em SALVAR (ou CANCELAR, se estiver errado). Depois de salvar, a tela fica VERDE na entrada e AZUL na saída.' },
    { alvo: 'scan-equipe', titulo: 'Sua equipe', posicao: 'bottom', icone: 'Users',
      descricao: 'Atalho para o painel do seu fornecedor, onde você vê quem já registrou cada etapa e quem ainda está pendente. Vale abrir de tempos em tempos durante o evento.' },
  ],
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const [{ evento }, perfil] = await Promise.all([searchParams, getPerfil()])
  if (!perfil) redirect('/login')
  if (!podeEscanear(perfil)) redirect('/admin')

  // Eventos que ESTE usuário pode escanear:
  // master → todos ativos | admin → da própria org | supervisor → só o do próprio setor
  const [eventos, setor] = await Promise.all([eventosEscaneaveis(perfil), meuSetor(perfil)])

  /*
   * Método de identificação de cada evento — QUERY SEPARADA e TOLERANTE
   * (mesmo padrão de `exige_meio`/`link_ativo` no resto do sistema): pedir
   * uma coluna que ainda não existe (migração pendente) derrubaria a
   * consulta INTEIRA, e o portão inteiro pararia de escanear por causa de um
   * campo que nem está em uso ainda. Sem a migração, cai em {} — todo evento
   * se comporta como 'qr', que é exatamente o comportamento de sempre.
   */
  let metodosPorEvento: Record<string, string> = {}
  if (eventos?.length) {
    try {
      const { data, error } = await supabaseAdmin
        .from('eventos').select('id, metodo_identificacao').in('id', eventos.map(e => e.id))
      if (!error && data) {
        metodosPorEvento = Object.fromEntries(data.map(e => [e.id as string, (e.metodo_identificacao as string) ?? 'qr']))
      }
    } catch { /* biometria ainda não migrada — todo evento fica 'qr' */ }
  }

  /*
   * Subeventos de cada evento (Vital, 30/09/2026) — mesma consulta tolerante
   * de `metodosPorEvento` acima: sem a migração, cai em {} e nenhum evento
   * mostra seletor de subevento (comportamento de sempre).
   */
  let subeventosPorEvento: Record<string, { id: string; nome: string }[]> = {}
  if (eventos?.length) {
    try {
      const { data, error } = await supabaseAdmin
        .from('subeventos').select('id, nome, evento_id').in('evento_id', eventos.map(e => e.id))
      if (!error && data) {
        subeventosPorEvento = {}
        for (const s of data) {
          const lista = (subeventosPorEvento[s.evento_id as string] ??= [])
          lista.push({ id: s.id as string, nome: s.nome as string })
        }
      }
    } catch { /* subeventos ainda não migrado — nenhum evento mostra seletor */ }
  }

  /*
   * Pra onde a setinha de voltar manda (pedido do Juan, 02/10/2026: "TODAS
   * AS TELAS PRECISAM TER BOTAO DE VOLTAR", repetido duas vezes — o /scan
   * era a que mais causava problema, por não ter NENHUMA saída clara: esta
   * tela fica fora do layout do admin (sem o menu lateral), então sem isto
   * o operador de portão não tinha como sair dela a não ser pelo botão
   * "voltar" do próprio navegador.
   */
  const voltarHref =
    perfil.role === 'operador_portao' ? '/admin/bem-vindo'
    : perfil.role === 'supervisor' ? '/admin/meus-eventos'
    : '/admin'

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil.role)}>
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/*
       * Esta tela é SEMPRE escura (fundo fixo, não participa do tema) — mas
       * `text-slate-400`/`border-slate-800` SÃO temáticos: no tema claro,
       * `--color-slate-400` vira quase preto e os links somem em cima do
       * fundo escuro (achado do Juan, 02/10/2026 — "Registrar ponto" e
       * companhia ilegíveis na tela cheia do operador). Branco translúcido
       * não depende de tema nenhum — mesmo remédio do resto deste arquivo.
       */}
      <div className="px-4 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <Link
            href={voltarHref}
            aria-label="Voltar"
            className="w-8 h-8 -ml-1 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">Credenciei</span>
        </div>
        <div className="flex items-center gap-3">
          <TutorialButton />
          {setor ? (
            <Link
              href={`/admin/eventos/${setor.evento_id}/fornecedor/${setor.id}`}
              data-tutorial="scan-equipe"
              className="flex items-center gap-1.5 text-white/60 text-sm hover:text-white font-medium transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              Minha equipe: {setor.nome}
            </Link>
          ) : podeGerenciarEventos(perfil) ? (
            <Link href="/admin" className="text-white/60 text-sm hover:text-white font-medium transition-colors">
              Voltar ao painel
            </Link>
          ) : podeAcompanhar(perfil) ? (
            // Sem setor e sem gerenciar evento: é o operador de portão — o
            // link dele é o registro manual, não "voltar ao painel" (que ele
            // não tem) nem "minha equipe" (que ele também não tem).
            <Link href="/admin/localizar" className="flex items-center gap-1.5 text-white/60 text-sm hover:text-white font-medium transition-colors">
              <ClipboardCheck className="w-3.5 h-3.5" />
              Registrar ponto
            </Link>
          ) : null}
        </div>
      </div>
      {!eventos?.length ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <QrCode className="w-10 h-10 text-white/30" />
          <p className="text-white/60 font-medium">Nenhum evento ativo disponível</p>
        </div>
      ) : (
        <ScannerRouter
          eventos={eventos}
          initialEventoId={evento}
          metodosPorEvento={metodosPorEvento}
          subeventosPorEvento={subeventosPorEvento}
          portaoNome={(perfil as { portao_nome?: string | null }).portao_nome ?? null}
          ehMasterOperador={ehMaster(perfil.role)}
        />
      )}
    </div>
    </TutorialProvider>
  )
}
