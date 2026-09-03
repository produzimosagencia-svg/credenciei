import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowDown, Link as LinkIcon, MessageCircle, QrCode, Quote,
  ScanLine, ShieldCheck, Wallet, Zap, User,
} from 'lucide-react'
import s from './_landing/landing.module.css'
import Revelar from './_landing/Revelar'
import Calculadora from './_landing/Calculadora'
import AnimatedScanLoader from '@/components/ui/animated-scan-loader'

/*
 * Landing pública — a raiz do site. O painel continua em /admin; quem já
 * está logado chega lá pelo "Entrar" (o login redireciona) ou direto pela URL.
 *
 * Os textos, números e o preço são os aprovados no Claude Design. Três coisas
 * ainda são PLACEHOLDER, propositalmente iguais ao desenho, pra trocar quando
 * o material chegar: os seis logos de clientes, os três depoimentos e o
 * número do WhatsApp em WHATSAPP_COMERCIAL.
 *
 * Tudo em coluna única e centralizado: não há blocos à esquerda e à direita.
 */

export const metadata: Metadata = {
  title: 'Credenciei — credenciamento de equipes para eventos',
  description: 'Fornecedores cadastram a equipe por link, cada pessoa recebe um QR único e o check-in no portão fica registrado.',
}

const WHATSAPP_COMERCIAL = 'https://wa.me/5500000000000'

const PASSOS = [
  { n: '01', Icone: LinkIcon, titulo: 'Fornecedores cadastram a equipe por link', texto: 'Você cria o evento e os setores. Cada setor ganha um link de cadastro — o fornecedor manda pro time dele e a lista se preenche sozinha. Você aprova em lote.', quem: 'Produtor · antes do evento' },
  { n: '02', Icone: QrCode, titulo: 'Cada pessoa recebe um QR único', texto: 'Função, setor e período de acesso já vão na credencial digital, direto no WhatsApp da pessoa. Nada pra imprimir na véspera.', quem: 'Equipe · no celular' },
  { n: '03', Icone: ScanLine, titulo: 'Check-in no portão, registrado', texto: 'Quem controla o acesso escaneia. Entrada, meio e saída ficam gravados por hora e por pessoa, e saem em relatório no fim do dia.', quem: 'Portaria · durante o evento' },
]

const BENEFICIOS = [
  { Icone: ShieldCheck, titulo: 'Controle', texto: 'Uma visão só de todos os fornecedores. Quem entrou, por onde, a que hora — em tempo real, sem ligar pra ninguém.', num: '100%', numSub: 'dos acessos com rastro' },
  { Icone: Wallet, titulo: 'Economia', texto: 'Quem não bateu ponto não é pago. O relatório de presença fecha a conta com cada fornecedor sem discussão.', num: 'R$ 0', numSub: 'por quem não foi' },
  { Icone: Zap, titulo: 'Praticidade', texto: 'Cadastro pelo link, credencial no WhatsApp, leitura em segundos. Sem planilha paralela, sem crachá refeito na hora.', num: '< 3s', numSub: 'por check-in' },
]

const DEPOIMENTOS = [
  { texto: '“Com 35 setores e mil pessoas, a gente sempre perdia a manhã do evento conferindo lista. Este ano o portão abriu e a fila simplesmente não existiu.”', nome: 'Nome do produtor', cargo: 'Diretor de produção · Festival' },
  { texto: '“O relatório de presença acabou com a briga de pagamento com fornecedor. Quem não entrou, não aparece. Ponto final.”', nome: 'Nome da produtora', cargo: 'Sócia · Produtora de eventos' },
  { texto: '“Mandei o link pros fornecedores na segunda, na quarta a equipe inteira já estava com QR no celular. Eu não digitei um nome.”', nome: 'Nome do gerente', cargo: 'Gerente de operações · Arena' },
]

const CLIENTES = Array.from({ length: 6 }, (_, i) => `Logo cliente ${i + 1}`)

export default function Landing() {
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
            <a href="#prova">Clientes</a>
            <a href="#precos">Preços</a>
          </div>
          <div className={s.navAcoes}>
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
          <div><p className={s.numero}>1.008</p><p className={s.numeroSub}>pessoas num único evento</p></div>
          <div><p className={s.numero}>&lt; 3s</p><p className={s.numeroSub}>por check-in no portão</p></div>
        </div>
      </section>

      {/* CLIENTES — logos em cinza, do mesmo tamanho, passando pra direita. */}
      <section className={`${s.limite} ${s.clientes}`} data-revelar>
        <p className={s.clientesTitulo}>Quem já credenciou com a gente</p>
        <div className={s.esteira} aria-label="Logos de clientes">
          <div className={s.esteiraTrilho}>
            {[...CLIENTES, ...CLIENTES].map((nome, i) => (
              <div key={i} className={s.clienteSlot} aria-hidden={i >= CLIENTES.length}>{nome}</div>
            ))}
          </div>
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

      {/* PROVA SOCIAL */}
      <section id="prova" className={`${s.limite} ${s.secao}`}>
        <div className={s.secaoTopo} data-revelar>
          <p className={s.kicker}>Quem produz, aprova</p>
          <h2 className={s.h2}>Produtores que trocaram a prancheta pelo QR.</h2>
        </div>
        <div className={s.depoimentos}>
          {DEPOIMENTOS.map(d => (
            <figure key={d.nome} className={`${s.cartao} ${s.depoimento}`} data-revelar>
              <figcaption>
                <span className={s.depoimentoFoto}><User size={26} /></span>
                <div><p className={s.depoimentoNome}>{d.nome}</p><p className={s.depoimentoCargo}>{d.cargo}</p></div>
                <Quote size={24} color="#FF4A0F" className={s.depoimentoAspas} />
              </figcaption>
              <blockquote>{d.texto}</blockquote>
            </figure>
          ))}
        </div>
      </section>

      {/* PREÇOS — direto: título, uma linha e o cartão com a conta. */}
      <section id="precos" className={`${s.limite} ${s.secao}`}>
        <div className={s.secaoTopo} data-revelar>
          <p className={s.kicker}>Preço simples</p>
          <h2 className={s.h2}>Um valor por evento. Um real por pessoa.</h2>
          <p className={s.lead}>Sem mensalidade e sem licença por usuário. Setores, operadores, lembretes por WhatsApp e relatórios já estão inclusos.</p>
        </div>
        <div className={s.precoCartao} data-revelar>
          <p className={s.precoRotulo}>Por evento</p>
          <p className={s.precoLinha}><span className={s.precoValor}>R$ 500</span><span className={s.precoDesc}>taxa fixa</span></p>
          <div className={s.precoMais}><span /><span className={s.mais}>+</span><span /></div>
          <p className={s.precoLinha}><span className={`${s.precoValorGradiente} ${s.gradienteTexto}`}>R$ 1</span><span className={s.precoDesc}>por funcionário credenciado</span></p>
          <Calculadora />
        </div>
      </section>

      {/* CTA FINAL */}
      <section id="cta" className={`${s.limite} ${s.cta}`} data-revelar>
        <div className={s.ctaCaixa}>
          <span className={s.ctaLuz} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/iso-laranja.png" alt="" className={s.ctaIso} />
          <h2>Seu próximo evento começa com a equipe certa passando pelo portão certo.</h2>
          <p>Conte quantas pessoas você credencia e a gente monta o evento com você. Resposta em horas, não em dias.</p>
          <a href={WHATSAPP_COMERCIAL} target="_blank" rel="noopener" className={`${s.btn} ${s.btnPrimario} ${s.btnEnorme}`}><MessageCircle size={20} />Fale com o nosso time no WhatsApp</a>
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
