'use client'
import { useEffect, type ReactNode } from 'react'
import { Download, X } from 'lucide-react'

/**
 * A página do relatório em PDF no padrão do modelo (docs/modelo de relatorio .pdf, pedido do Juan, 12/10/2026). Na tela
 * mostra as folhas A4 empilhadas; "Baixar PDF" abre a impressão do navegador ("Salvar como PDF") — exatamente como o
 * modelo foi feito. O nome do arquivo sai do título da página.
 */
export default function Documento({ nomeArquivo, children }: { nomeArquivo: string; children: ReactNode }) {
  useEffect(() => { document.title = nomeArquivo }, [nomeArquivo])

  return (
    <div className="rd-raiz">
      <style>{CSS}</style>
      <div className="rd-ferramentas">
        <button type="button" onClick={() => window.print()} className="rd-botao rd-botao-primario">
          <Download size={16} /> Baixar PDF
        </button>
        <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())} className="rd-botao">
          <X size={16} /> Fechar
        </button>
      </div>
      {children}
    </div>
  )
}

const LARANJA = '#E8542A'
const CSS = `
  html, body { background: #CFCAC4 !important; margin: 0; }
  .rd-raiz { padding: 16mm 0 10mm; font-family: var(--font-archivo), 'Archivo', system-ui, -apple-system, sans-serif; color: #1F1E1D; }
  .rd-ferramentas { position: fixed; top: 12px; right: 16px; display: flex; gap: 8px; z-index: 50; }
  .rd-botao { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #D8D3CD; background: #fff; color: #1F1E1D;
    font: 600 14px var(--font-archivo), 'Archivo', system-ui, sans-serif; padding: 9px 14px; border-radius: 10px; cursor: pointer; }
  .rd-botao-primario { background: #FF4A0F; border-color: #FF4A0F; color: #fff; }

  .rd-folha { width: 210mm; height: 297mm; margin: 0 auto 8mm; padding: 13mm 14mm 12mm; box-sizing: border-box; position: relative;
    background: #F5F3F0; box-shadow: 0 6px 30px rgba(0,0,0,.18); overflow: hidden; }
  .rd-topo { display: flex; justify-content: space-between; align-items: center; height: 10mm; }
  .rd-logo { height: 6.4mm; width: auto; }
  .rd-evento { color: ${LARANJA}; font-size: 9.5pt; letter-spacing: .16em; text-transform: uppercase; }
  .rd-rotulo { margin: 6mm 0 0; color: ${LARANJA}; font-size: 9pt; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; }
  .rd-rotulo-continua { margin-bottom: 2mm; }
  .rd-titulo { margin: 2.5mm 0 5mm; font-size: 26pt; font-weight: 800; letter-spacing: -.04em; line-height: 1.05; color: #141312; }
  .rd-aviso { margin: 0 0 1mm; padding: 3.2mm 5mm; border: 1px solid #F0B9A6; border-left: 4px solid #F25C2A; border-radius: 3.5mm;
    background: #F8E4DC; font-size: 10pt; line-height: 1.4; }
  .rd-aviso b { color: ${LARANJA}; font-weight: 800; }
  .rd-tabela { width: 100%; border-collapse: collapse; margin-top: 6mm; table-layout: fixed; }
  .rd-tabela th { font-size: 8pt; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; text-align: left;
    padding: 0 2mm 2.6mm 0; border-bottom: .6mm solid #1F1E1D; white-space: nowrap; }
  .rd-tabela td { height: 7.4mm; border-bottom: .25mm solid #E3DFDA; font-size: 10.5pt; padding: 0 2mm 0 0; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .rd-tabela td:last-child, .rd-tabela th:last-child { padding-right: 0; }
  .rd-dir { text-align: right !important; }
  .rd-nome { font-weight: 700; }
  .rd-texto { color: #6F6A64; }
  .rd-numero { font-variant-numeric: tabular-nums; }
  .rd-destaque { color: ${LARANJA}; font-weight: 800; font-size: 12pt; font-variant-numeric: tabular-nums; }
  .rd-barra { display: inline-block; width: 100%; max-width: 30mm; height: 1.4mm; border-radius: 1mm; background: #E2DED9; vertical-align: middle; overflow: hidden; }
  .rd-barra-cheia { display: block; height: 100%; background: #F25C2A; border-radius: 1mm; }
  .rd-vazio { margin-top: 8mm; color: #6F6A64; font-size: 11pt; }
  .rd-rodape { position: absolute; left: 14mm; bottom: 10mm; font-size: 9pt; color: #6F6A64; }

  @page { size: A4; margin: 0; }
  @media print {
    html, body { background: none !important; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .rd-raiz { padding: 0; }
    .rd-ferramentas { display: none; }
    .rd-folha { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
    .rd-folha:last-child { break-after: auto; page-break-after: auto; }
  }
`
