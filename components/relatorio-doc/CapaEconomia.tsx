'use client'
import { useSyncExternalStore } from 'react'

/** Onde o botão "Economia com faltas" deixa a logo do evento escolhida na hora (pedida a cada geração). */
export const CHAVE_LOGO_ECONOMIA = 'credenciei-logo-economia'

/**
 * A CAPA do PDF de economia com faltas (docs/economia-faltas-vital.pdf, Juan, 14/10/2026): fundo escuro, o símbolo
 * 3D grande, o valor economizado no topo, os três números embaixo e a marca no rodapé. No canto superior direito, a
 * logo do EVENTO — enviada por quem gera o relatório, a cada geração (fica só no navegador, nunca no banco).
 */
export default function CapaEconomia({ eventoId, rotulo, valor, frase, cadastrados, foram, faltaram }: {
  eventoId: string
  rotulo: string
  valor: string
  frase: string
  cadastrados: number
  foram: number
  faltaram: number
}) {
  // Lida do navegador depois de montar (no servidor não existe: a capa nasce sem a logo e ela entra na hidratação).
  const logo = useSyncExternalStore(() => () => {}, () => logoGuardada(eventoId), () => null)

  const n = (v: number) => v.toLocaleString('pt-BR')
  return (
    <section className="rd-folha rd-capa">
      <style>{CSS_CAPA}</style>
      <header className="rd-capa-topo">
        <span className="rd-capa-evento">{rotulo}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img src={logo} alt="Logo do evento" className="rd-capa-logo-evento" />}
      </header>
      <p className="rd-capa-rotulo">Economia gerada pelo Credenciei</p>
      <p className="rd-capa-valor">{valor}</p>
      <p className="rd-capa-frase">{frase}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/marca/iso-3d.png" alt="" className="rd-capa-simbolo" />
      <div className="rd-capa-numeros">
        <div className="rd-capa-card"><b>{n(cadastrados)}</b><span>Cadastrados</span></div>
        <div className="rd-capa-card"><b className="rd-capa-verde">{n(foram)}</b><span>Bateram entrada</span></div>
        <div className="rd-capa-card"><b className="rd-capa-laranja">{n(faltaram)}</b><span>Não compareceram</span></div>
      </div>
      <footer className="rd-capa-rodape">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-branco.png" alt="Credenciei" className="rd-capa-marca" />
        <span>credenciei.com.br</span>
      </footer>
    </section>
  )
}

function logoGuardada(eventoId: string): string | null {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_LOGO_ECONOMIA) ?? 'null') as { eventoId?: string; dataUrl?: string } | null
    return salvo?.eventoId === eventoId && salvo.dataUrl?.startsWith('data:image/') ? salvo.dataUrl : null
  } catch { return null /* sem armazenamento: a capa sai sem a logo do evento */ }
}

const CSS_CAPA = `
  .rd-capa { background: radial-gradient(120% 80% at 50% 38%, #3a1608 0%, #1a0d07 45%, #0b0b0b 100%) !important; color: #fff;
    padding: 13mm 14mm 12mm; display: flex; flex-direction: column; }
  .rd-capa-topo { display: flex; justify-content: space-between; align-items: flex-start; min-height: 16mm; }
  .rd-capa-evento { font-size: 9pt; letter-spacing: .04em; text-transform: uppercase; color: #fff; padding-top: 3mm; }
  .rd-capa-logo-evento { max-height: 30mm; max-width: 60mm; object-fit: contain; }
  .rd-capa-rotulo { margin: 4mm 0 0; color: #F25C2A; font-size: 9pt; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
  .rd-capa-valor { margin: 2mm 0 0; font-size: 46pt; font-weight: 800; letter-spacing: -.03em; line-height: 1.05; }
  .rd-capa-frase { margin: 2mm 0 0; font-size: 11pt; color: rgba(255,255,255,.85); }
  .rd-capa-simbolo { display: block; width: 125mm; height: auto; margin: 2mm auto 0; flex: 1 1 auto; object-fit: contain; min-height: 0; }
  .rd-capa-numeros { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin-top: 4mm; }
  .rd-capa-card { border: 1px solid rgba(255,255,255,.14); border-radius: 3mm; background: rgba(0,0,0,.45); padding: 5mm 6mm; }
  .rd-capa-card b { display: block; font-size: 20pt; font-weight: 800; line-height: 1.1; }
  .rd-capa-card span { display: block; margin-top: 1.5mm; font-size: 7.5pt; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; color: rgba(255,255,255,.85); }
  .rd-capa-verde { color: #4ADE80; }
  .rd-capa-laranja { color: #FB7A4A; }
  .rd-capa-rodape { display: flex; justify-content: space-between; align-items: center; margin-top: 6mm; padding-top: 6mm; border-top: .6mm solid rgba(255,255,255,.12); }
  .rd-capa-marca { height: 9mm; width: auto; }
  .rd-capa-rodape span { font-size: 15pt; color: rgba(255,255,255,.6); }
`
