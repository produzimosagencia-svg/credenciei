import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowDown, Link as LinkIcon, MessageCircle, QrCode,
  ScanLine, ShieldCheck, Wallet, Zap,
} from 'lucide-react'
import s from './_landing/landing.module.css'
import Revelar from './_landing/Revelar'
import Calculadora from './_landing/Calculadora'
import AnimatedScanLoader from '@/components/ui/animated-scan-loader'
import IconeInstagram from '@/components/ui/IconeInstagram'
import VideoApp from './_landing/VideoApp'

/*
 * Landing pública — a raiz do site. O painel continua em /admin; quem já
 * está logado chega lá pelo "Entrar" (o login redireciona) ou direto pela URL.
 *
 * Os textos, números e o preço são os aprovados no Claude Design. A esteira
 * de logos de clientes e a seção de depoimentos foram tiradas em 29/09/2026
 * (pedido do Juan) — eram PLACEHOLDER ("Logo cliente 1", "Nome do produtor"
 * etc.) e ficavam mal até ter material de verdade pra mostrar. O CSS das
 * duas (`.clientes`, `.esteira*`, `.clienteSlot`, `.depoimentos`,
 * `.depoimento*`) continua no módulo, sem uso, pra não perder o trabalho
 * quando o material chegar.
 *
 * O caminho comercial é o WhatsApp, pelo atalho /wa (que registra a origem).
 * Não existe formulário aqui, e não deve existir.
 *
 * Tudo em coluna única e centralizado: não há blocos à esquerda e à direita.
 */

export const metadata: Metadata = {
  title: 'Credenciei — credenciamento de equipes para eventos',
  description: 'Fornecedores cadastram a equipe por link, cada pessoa recebe um QR único e o check-in no portão fica registrado.',
}

/*
 * A landing nunca aponta pro wa.me direto: ela passa pelo atalho /wa, que
 * registra de onde veio o clique antes de abrir a conversa. O número mora em
 * lib/whatsapp-comercial.ts, num lugar só.
 *
 * `utmDaUrl` repassa a origem de quem chegou aqui com UTM (link da bio,
 * anúncio) pro atalho, pra o clique no botão herdar a mesma origem da visita.
 */
const UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

function atalhoWhatsApp(busca: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams()
  for (const chave of UTMS) {
    const valor = busca[chave]
    const texto = Array.isArray(valor) ? valor[0] : valor
    if (texto) query.set(chave, texto.slice(0, 200))
  }
  if (!query.has('utm_source')) {
    // Chegou na landing sem origem: o clique ainda conta, como tráfego do site.
    query.set('utm_source', 'site')
    query.set('utm_medium', 'landing')
  }
  return `/wa?${query.toString()}`
}

const PASSOS = [
  { n: '01', Icone: LinkIcon, titulo: 'Fornecedores cadastram a equipe por link', texto: 'Você cria o evento e os setores. Cada setor ganha um link de cadastro — o fornecedor manda pro time dele e a lista se preenche sozinha. Você aprova em lote.', quem: 'Produtor · antes do evento' },
  { n: '02', Icone: QrCode, titulo: 'Cada pessoa recebe um QR único', texto: 'Função, setor e período de acesso já vão na credencial digital, direto no WhatsApp da pessoa. Nada pra imprimir na véspera.', quem: 'Equipe · no celular' },
  { n: '03', Icone: ScanLine, titulo: 'Check-in no portão, por QR ou reconhecimento facial', texto: 'Quem controla o acesso escaneia o QR — ou aponta a câmera e o sistema reconhece o rosto sozinho. Entrada, meio e saída ficam gravados por hora e por pessoa, e saem em relatório no fim do dia.', quem: 'Portaria · durante o evento' },
]

const BENEFICIOS = [
  { Icone: ShieldCheck, titulo: 'Controle', texto: 'Uma visão só de todos os fornecedores. Quem entrou, por onde, a que hora — em tempo real, sem ligar pra ninguém.', num: '100%', numSub: 'dos acessos com rastro' },
  { Icone: Wallet, titulo: 'Economia', texto: 'Quem não bateu ponto não é pago. O relatório de presença fecha a conta com cada fornecedor sem discussão.', num: 'R$ 0', numSub: 'por quem não foi' },
  { Icone: Zap, titulo: 'Praticidade', texto: 'Cadastro pelo link, credencial no WhatsApp, leitura em segundos. Sem planilha paralela, sem crachá refeito na hora.', num: '< 3s', numSub: 'por check-in' },
]

export default async function Landing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Next 16: searchParams é Promise e precisa de await.
  const busca = await searchParams
  const WHATSAPP_COMERCIAL = atalhoWhatsApp(busca)

  return (
    <div className={s.pagina} id="topo">
      <Revelar />
      {/* NAV flutuante */}
      <div className={s.navWrap}>
        <nav className={s.nav}>
          <a href="#topo" aria-label="Credenciei" className={s.navMarca}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/iso-laranja.png" alt="" style={{ height: 28, width: 'auto' }} />
          </a>
          <div className={s.navLinks}>
            <a href="#como" className={s.ativo}>Como funciona</a>
            <a href="#beneficios">Benefícios</a>
            <a href="#precos">Preços</a>
          </div>
          <div className={s.navAcoes}>
            <a
              href="https://www.instagram.com/credenciei"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Credenciei no Instagram"
              style={{ display: 'flex', alignItems: 'center', color: 'inherit', opacity: 0.8 }}
            >
              <IconeInstagram size={20} />
            </a>
            <Link href="/login" className={`${s.btn} ${s.btnVidro}`}>Entrar</Link>
            <a href="#cta" className={`${s.btn} ${s.btnPrimario}`}><MessageCircle size={16} />Fale com o time</a>
          </div>
        </nav>
      </div>

      {/* HERO */}
      <section className={`${s.limite} ${s.hero}`} data-revelar>
        {/* O logo sendo "escaneado": a linha laranja varre e corta a marca. */}
        <AnimatedScanLoader className={s.logoScan}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-branco.png" alt="" className={s.logoScanImg} />
        </AnimatedScanLoader>
        <h1 className={s.h1}>Toda a equipe do seu evento credenciada, <span className={s.gradienteTexto}>sem fila e sem planilha.</span></h1>
        <p className={s.heroTexto}>Fornecedores cadastram a equipe por link, cada pessoa recebe um QR único e o check-in no portão fica registrado — quem entrou, por onde e a que hora.</p>
        <div className={s.heroAcoes}>
          <a href="#cta" className={`${s.btn} ${s.btnPrimario} ${s.btnGrande}`}><MessageCircle size={18} />Fale com o nosso time</a>
          <a href="#como" className={`${s.btn} ${s.btnVidro} ${s.btnGrande}`}>Ver como funciona<ArrowDown size={16} /></a>
        </div>
        <div className={s.heroNumeros}>
          <div><p className={s.numero}>+4.800</p><p className={s.numeroSub}>profissionais credenciados</p></div>
          <div><p className={s.numero}>2.036</p><p className={s.numeroSub}>pessoas num único evento</p></div>
          <div><p className={s.numero}>&lt; 3s</p><p className={s.numeroSub}>por check-in no portão</p></div>
        </div>
      </section>

      {/* APP — a mesma animação de abertura do aplicativo dos colaboradores. */}
      <section className={`${s.limite} ${s.secao}`} data-revelar>
        <div className={s.secaoTopo}>
          <p className={s.kicker}>Em breve</p>
          <h2 className={s.h2}>Sua equipe vai levar a credencial no bolso.</h2>
          <p className={s.lead}>Estamos lançando o app Credenciei pra colaboradores — credencial, histórico e pagamento sempre à mão, sem depender do link do WhatsApp.</p>
        </div>
        <div className={s.videoMoldura}>
          <VideoApp className={s.video} />
        </div>
      </section>

      {/* NA PRÁTICA */}
      <section id="como" className={`${s.limite} ${s.secao}`}>
        <div className={s.secaoTopo} data-revelar>
          <p className={s.kicker}>Na prática</p>
          <h2 className={s.h2}>Três passos. Do cadastro ao portão.</h2>
          <p className={s.lead}>Você cria o evento e os setores. O resto acontece no celular de quem trabalha e de quem controla a entrada.</p>
        </div>
        <div className={s.passos}>
          {PASSOS.map(p => (
            <div key={p.n} className={`${s.cartao} ${s.passo}`} data-revelar>
              <div className={s.passoTopo}>
                <span className={s.passoNumero}>{p.n}</span>
                <span className={s.passoIcone}><p.Icone size={22} /></span>
              </div>
              <h3>{p.titulo}</h3>
              <p className={s.passoTexto}>{p.texto}</p>
              <p className={s.passoQuem}>{p.quem}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section id="beneficios" className={`${s.limite} ${s.secao}`}>
        <div className={s.secaoTopo} data-revelar>
          <p className={s.kicker}>Por que contratar</p>
          <h2 className={s.h2}>O evento não espera. O credenciamento também não.</h2>
          <p className={s.lead}>Cada credencial é verificável e cada acesso deixa rastro. Você deixa de gerenciar papel e passa a gerenciar a operação.</p>
        </div>
        <div className={s.beneficiosLista}>
          {BENEFICIOS.map(b => (
            <div key={b.titulo} className={`${s.cartao} ${s.beneficio}`} data-revelar>
              <span className={s.beneficioIcone}><b.Icone size={28} /></span>
              <h3>{b.titulo}</h3>
              <p className={s.beneficioTexto}>{b.texto}</p>
              <div className={s.beneficioNumero}><p>{b.num}</p><p>{b.numSub}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* PREÇOS — direto: título, uma linha e o cartão com a conta. */}
      <section id="precos" className={`${s.limite} ${s.secao}`}>
        <div className={s.secaoTopo} data-revelar>
          <p className={s.kicker}>Preço simples</p>
          <h2 className={s.h2}>Um valor por evento. Um real por pessoa.</h2>
          <p className={s.lead}>Sem mensalidade pra evento avulso, e sem licença por usuário. Setores, operadores, lembretes por WhatsApp e relatórios já estão inclusos.</p>
        </div>
        <div className={s.precoCartao} data-revelar>
          <p className={s.precoRotulo}>Por evento · a partir de</p>
          <p className={s.precoLinha}><span className={s.precoValor}>R$ 500</span><span className={s.precoDesc}>taxa fixa</span></p>
          <div className={s.precoMais}><span /><span className={s.mais}>+</span><span /></div>
          <p className={s.precoLinha}><span className={`${s.precoValorGradiente} ${s.gradienteTexto}`}>R$ 1</span><span className={s.precoDesc}>por funcionário credenciado</span></p>
          <Calculadora />
        </div>
        <p className={s.lead} data-revelar style={{ marginTop: 24, textAlign: 'center' }}>
          Casa de festas ou espaço com evento toda semana? Também temos{' '}
          <a href={WHATSAPP_COMERCIAL} className={s.gradienteTexto} style={{ fontWeight: 700 }}>pacote mensal</a> — fale com a gente.
        </p>
      </section>

      {/* CTA FINAL */}
      <section id="cta" className={`${s.limite} ${s.cta}`} data-revelar>
        <div className={s.ctaCaixa}>
          <span className={s.ctaLuz} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/iso-3d.png" alt="" className={s.ctaIso} />
          <h2>Seu próximo evento começa com a equipe certa passando pelo portão certo.</h2>
          <p>Conte quantas pessoas você credencia e a gente monta o evento com você. Resposta em horas, não em dias.</p>
          <a href={WHATSAPP_COMERCIAL} className={`${s.btn} ${s.btnPrimario} ${s.btnEnorme}`}><MessageCircle size={20} />Fale com o nosso time no WhatsApp</a>
        </div>
      </section>

      <footer className={s.rodape}>
        <div className={`${s.limite} ${s.rodapeInterno}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-branco.png" alt="Credenciei" style={{ height: 18, width: 'auto', opacity: 0.7 }} />
          <div className={s.rodapeLinks}><a href="#como">Como funciona</a><a href="#beneficios">Benefícios</a><a href="#precos">Preços</a><Link href="/login">Entrar</Link></div>
          <span>credenciei.com.br · © {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  )
}
