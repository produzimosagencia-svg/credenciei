'use client'

/**
 * O campo "Que horas ela entrou?" (HH:MM) das telas do portão (Juan, 19/10/2026: "o modal da hora está torto").
 *
 * No iPhone o `<input type="time">` ignora a largura do pai e estoura a caixa, e com fundo transparente o que está atrás
 * (a câmera) aparece por dentro. Aqui: aparência do navegador desligada, largura presa à caixa, fundo BRANCO sólido e
 * texto escuro — cores fixas, que não mudam com o tema (a tela do leitor é escura nos dois temas). Texto grande
 * (acima de 16 px) para o iPhone não ampliar a tela ao tocar.
 */
export default function CampoHoraDeEntrada({
  id, valor, aoMudar, autoFocus = false,
}: { id: string; valor: string; aoMudar: (hora: string) => void; autoFocus?: boolean }) {
  return (
    <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden', borderRadius: 14 }}>
      <input
        id={id}
        type="time"
        value={valor}
        autoFocus={autoFocus}
        onChange={e => aoMudar(e.target.value)}
        style={{
          WebkitAppearance: 'none', appearance: 'none', boxSizing: 'border-box', display: 'block',
          width: '100%', minWidth: 0, maxWidth: '100%', height: 60, margin: 0, padding: '0 14px',
          background: '#ffffff', color: '#0f172a', border: '2px solid #94a3b8', borderRadius: 14,
          fontSize: 30, fontWeight: 800, textAlign: 'center', fontVariantNumeric: 'tabular-nums', outline: 'none',
        }}
      />
    </div>
  )
}
