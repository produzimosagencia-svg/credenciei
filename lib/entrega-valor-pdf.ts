import { readFileSync } from 'fs'
import path from 'path'
import type { DadosEntregaValor } from './entrega-valor'
import { formatarBR } from './tz'
import { linkRastreado } from './links-rastreados'

/**
 * O PDF de "entrega de valor" — vai para o cliente entender o que o Credenciei entregou no evento dele (pedido do
 * Juan, 09/10/2026). Mesmo esqueleto de lib/orcamentos-pdf.ts: jsPDF puro no servidor, A4 em pontos, paleta da
 * marca. Só caracteres que a Helvetica do jsPDF tem (nada de travessão longo, sinal de menos ou setas).
 */

type RGB = [number, number, number]
const LARANJA: RGB = [255, 74, 15]
const LARANJA_ESCURO: RGB = [163, 27, 5]
const LARANJA_CLARO: RGB = [255, 241, 234]
const ESCURO: RGB = [31, 30, 29]
const CINZA: RGB = [110, 106, 102]
const BORDA: RGB = [228, 224, 220]
const VERDE: RGB = [22, 163, 74]
const AMARELO: RGB = [234, 179, 8]
const VERMELHO: RGB = [220, 38, 38]
const BRANCO: RGB = [255, 255, 255]

const n = (v: number) => v.toLocaleString('pt-BR')
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

function logo(arquivo: string): string | null {
  try {
    return `data:image/png;base64,${readFileSync(path.join(process.cwd(), 'public/marca', arquivo)).toString('base64')}`
  } catch (e) {
    console.error('[entrega-valor-pdf] logo não carregou', e instanceof Error ? e.message : e)
    return null
  }
}

export async function montarPdfEntregaValor(d: DadosEntregaValor): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40
  const L = W - M * 2
  let y = 0

  const cor = (c: RGB) => doc.setTextColor(...c)
  const fonte = (estilo: 'normal' | 'bold', tamanho: number) => { doc.setFont('helvetica', estilo); doc.setFontSize(tamanho) }
  const rodape = () => {
    fonte('normal', 8)
    cor(CINZA)
    const linha = `Gerado em ${formatarBR(new Date().toISOString(), 'completo')} (horário de Brasília)  ·  credenciei.com.br`
    doc.text(linha, W / 2, H - 22, { align: 'center' })
    // "credenciei.com.br" clicável — passa pelo /ir, que conta o clique (lib/links-rastreados.ts).
    const larguraSite = doc.getTextWidth('credenciei.com.br')
    doc.link(W / 2 + doc.getTextWidth(linha) / 2 - larguraSite, H - 30, larguraSite, 11, {
      url: linkRastreado('site', 'pdf', { evento: d.eventoId }, process.env.NEXT_PUBLIC_SITE_URL || 'https://credenciei.com.br'),
    })
  }
  const garantir = (altura: number) => {
    if (y + altura <= H - 50) return
    rodape()
    doc.addPage()
    doc.setFillColor(...LARANJA)
    doc.rect(0, 0, W, 8, 'F')
    y = 44
  }
  /** `alturaMinima`: o quanto da seção precisa caber junto do título — senão ela começa na página seguinte. */
  const tituloSecao = (texto: string, alturaMinima = 60) => {
    garantir(alturaMinima)
    fonte('bold', 10)
    cor(LARANJA)
    doc.text(texto, M, y)
    y += 8
    doc.setDrawColor(...BORDA)
    doc.setLineWidth(1)
    doc.line(M, y, M + L, y)
    y += 18
  }
  const paragrafo = (texto: string, tamanho = 10.5, c: RGB = ESCURO, largura = L, x = M) => {
    fonte('normal', tamanho)
    cor(c)
    const linhas = doc.splitTextToSize(texto, largura) as string[]
    garantir(linhas.length * (tamanho + 4))
    doc.text(linhas, x, y)
    y += linhas.length * (tamanho + 4)
  }
  const linhaNumero = (rotulo: string, valor: string, detalhe?: string) => {
    garantir(detalhe ? 34 : 22)
    fonte('normal', 10.5)
    cor(ESCURO)
    doc.text(rotulo, M, y)
    fonte('bold', 12)
    cor(LARANJA)
    doc.text(valor, M + L, y, { align: 'right' })
    if (detalhe) {
      y += 12
      fonte('normal', 8.5)
      cor(CINZA)
      doc.text(doc.splitTextToSize(detalhe, L - 80) as string[], M, y)
      y += 6
    }
    y += 10
    doc.setDrawColor(...BORDA)
    doc.setLineWidth(0.5)
    doc.line(M, y - 4, M + L, y - 4)
    y += 8
  }

  // ── Cabeçalho laranja ────────────────────────────────────────────────────
  const alturaFaixa = 150
  doc.setFillColor(...LARANJA)
  doc.rect(0, 0, W, alturaFaixa, 'F')
  doc.setFillColor(...LARANJA_ESCURO)
  doc.rect(0, alturaFaixa - 6, W, 6, 'F')
  const marca = logo('logo-branco.png')
  if (marca) {
    try {
      const props = doc.getImageProperties(marca)
      const larguraLogo = 120
      doc.addImage(marca, 'PNG', M, 34, larguraLogo, (props.height / props.width) * larguraLogo, undefined, 'FAST')
    } catch { /* sem logo é melhor que sem PDF */ }
  }
  fonte('bold', 9)
  cor(BRANCO)
  doc.text('RELATÓRIO DE ENTREGA DE VALOR', M + L, 46, { align: 'right' })
  fonte('bold', 22)
  doc.text(doc.splitTextToSize(d.eventoNome, L) as string[], M, 96)
  fonte('normal', 10)
  const sub = [
    d.periodo ? (d.periodo.de === d.periodo.ate ? dia(d.periodo.de) : `${dia(d.periodo.de)} a ${dia(d.periodo.ate)}`) : null,
    d.diasDeOperacao ? `${d.diasDeOperacao} dia${d.diasDeOperacao === 1 ? '' : 's'} de operação` : null,
    d.organizacaoNome,
  ].filter(Boolean).join('  ·  ')
  if (sub) doc.text(sub, M, 122)
  y = alturaFaixa + 34

  // ── Abertura ─────────────────────────────────────────────────────────────
  paragrafo(`Este relatório mostra o que o Credenciei entregou no ${d.eventoNome}: cada pessoa da equipe cadastrada e aprovada, conferida no portão e registrada na entrada e na saída, com rastro de tudo o que aconteceu.`, 11)
  y += 14

  // ── Números principais ───────────────────────────────────────────────────
  const tiles: [string, string][] = [
    [n(d.cadastros.total), 'pessoas cadastradas'],
    [n(d.presenca.pessoasQueTrabalharam), 'pessoas trabalharam'],
    [`${d.presenca.percentualCompletos.toLocaleString('pt-BR')}%`, 'turnos com entrada e saída corretas'],
    [n(d.seguranca.barradasNoPortao), 'acessos barrados no portão'],
  ]
  const gap = 10
  const tw = (L - gap * 3) / 4
  const th = 84
  garantir(th + 20)
  tiles.forEach(([valor, rotulo], i) => {
    const x = M + i * (tw + gap)
    doc.setFillColor(...LARANJA_CLARO)
    doc.roundedRect(x, y, tw, th, 8, 8, 'F')
    fonte('bold', 22)
    cor(LARANJA)
    doc.text(valor, x + tw / 2, y + 38, { align: 'center' })
    fonte('normal', 8.5)
    cor(ESCURO)
    doc.text(doc.splitTextToSize(rotulo, tw - 16) as string[], x + tw / 2, y + 56, { align: 'center' })
  })
  y += th + 32

  // ── Presença ─────────────────────────────────────────────────────────────
  tituloSecao('PRESENÇA SOB CONTROLE', 120)
  const total = d.presenca.completos + d.presenca.soEntrada + d.presenca.saidaSemEntrada
  garantir(40)
  if (total > 0) {
    const partes: [number, RGB][] = [[d.presenca.completos, VERDE], [d.presenca.soEntrada, AMARELO], [d.presenca.saidaSemEntrada, VERMELHO]]
    let x = M
    for (const [valor, c] of partes) {
      if (!valor) continue
      const w = (valor / total) * L
      doc.setFillColor(...c)
      doc.rect(x, y, w, 14, 'F')
      x += w
    }
    y += 30
  }
  linhaNumero('Turnos com entrada e saída registradas corretamente', n(d.presenca.completos), 'Cada turno é uma pessoa num dia de trabalho.')
  linhaNumero('Turnos só com a entrada (saída não registrada)', n(d.presenca.soEntrada))
  linhaNumero('Registros com problema (saída sem entrada)', n(d.presenca.saidaSemEntrada))
  linhaNumero('Horas de trabalho registradas', n(d.presenca.horasRegistradas))
  linhaNumero('Batidas de ponto registradas', n(d.presenca.batidas),
    `${n(d.presenca.regularizadasPelaEquipe)} regularizadas pela equipe de credenciamento · ${n(d.presenca.peloCelular)} pelo próprio celular fora do horário da portaria`)
  y += 10

  // ── Segurança ────────────────────────────────────────────────────────────
  tituloSecao('SEGURANÇA E CONTROLE DE ACESSO', 120)
  linhaNumero('Leituras de credencial no portão', n(d.seguranca.leiturasNoPortao))
  linhaNumero('Acessos barrados no portão', n(d.seguranca.barradasNoPortao),
    `${n(d.seguranca.qrInvalidoOuSemCadastro)} por QR inválido ou sem cadastro aprovado · ${n(d.seguranca.foraDoDiaOuLotado)} fora do dia de trabalho ou com o setor lotado`)
  linhaNumero('Tentativas de bater o ponto fora do local do evento', n(d.seguranca.tentativasForaDoLocal), 'Recusadas pelo sistema, com o endereço de onde a pessoa tentou.')
  linhaNumero('Batidas fora do local separadas para conferência', n(d.seguranca.batidasForaDoLocal))
  linhaNumero('CPFs bloqueados no evento', n(d.seguranca.cpfsBloqueados))
  linhaNumero('Credenciamentos negados', n(d.cadastros.negados))
  y += 10

  // ── Operação ─────────────────────────────────────────────────────────────
  tituloSecao('OPERAÇÃO', 170)
  linhaNumero('Fornecedores', n(d.fornecedores))
  linhaNumero('Supervisores', n(d.supervisores))
  linhaNumero('Pessoas aprovadas para trabalhar', n(d.cadastros.aprovados))
  linhaNumero('Alterações registradas na auditoria', n(d.alteracoesAuditadas), 'Toda correção de cadastro, de ponto ou de acesso fica com quem fez, o quê e quando.')
  y += 16

  // ── Fechamento ───────────────────────────────────────────────────────────
  const fechamento = `Com o Credenciei, o ${d.eventoNome} teve controle sobre ${n(d.cadastros.total)} pessoas cadastradas e ${n(d.presenca.pessoasQueTrabalharam)} que trabalharam. ${d.presenca.percentualCompletos.toLocaleString('pt-BR')}% dos turnos tiveram entrada e saída registradas corretamente. O sistema barrou ${n(d.seguranca.barradasNoPortao)} acessos no portão e ${n(d.seguranca.tentativasForaDoLocal)} tentativas de registro fora do local, evitando fraudes e garantindo que quem entrou no evento foi para trabalhar, e não para curtir.`
  const foco = 'O foco do Credenciei é dar controle total do que acontece no seu evento: quem entrou, por onde, a que hora e por quanto tempo ficou.'
  // A quebra de linha é medida na MESMA fonte em que o texto é desenhado (o negrito é mais largo).
  fonte('normal', 10.5)
  const l1 = doc.splitTextToSize(fechamento, L - 44) as string[]
  fonte('bold', 10.5)
  const l2 = doc.splitTextToSize(foco, L - 44) as string[]
  const alturaCaixa = 48 + l1.length * 14.5 + 10 + l2.length * 14.5
  garantir(alturaCaixa + 10)
  doc.setFillColor(...LARANJA_CLARO)
  doc.roundedRect(M, y, L, alturaCaixa, 10, 10, 'F')
  doc.setFillColor(...LARANJA)
  doc.rect(M, y, 5, alturaCaixa, 'F')
  fonte('bold', 12)
  cor(LARANJA_ESCURO)
  doc.text('O que o Credenciei somou ao seu evento', M + 22, y + 28)
  fonte('normal', 10.5)
  cor(ESCURO)
  doc.text(l1, M + 22, y + 48)
  fonte('bold', 10.5)
  doc.text(l2, M + 22, y + 48 + l1.length * 14.5 + 10)
  y += alturaCaixa

  rodape()
  return new Uint8Array(doc.output('arraybuffer'))
}
