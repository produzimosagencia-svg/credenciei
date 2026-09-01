'use client'
import { useState } from 'react'
import { Copy, Check, Download } from 'lucide-react'

/**
 * As ações da equipe, no painel do setor.
 *
 * Elas já existiam — mas só no cartão do setor, na tela do EVENTO, que o
 * supervisor nunca vê (ele é redirecionado direto para cá). Na prática, quem
 * mais precisa do link de cadastro e da planilha da própria equipe era
 * justamente quem não tinha acesso a nenhum dos dois.
 *
 * O botão de copiar mora aqui, e não no servidor, porque depende de
 * `window.location.origin`: o endereço muda entre produção, preview da Vercel
 * e desenvolvimento, e um link fixo mandaria a equipe para o lugar errado.
 */
export default function AcoesDaEquipe({ tokenFormulario }: { tokenFormulario: string | null }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = () => {
    if (!tokenFormulario) return
    navigator.clipboard.writeText(`${window.location.origin}/form/${tokenFormulario}`)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <>
      {tokenFormulario && (
        <button onClick={copiar} className="btn btn-secundario btn-sm">
          {copiado
            ? <Check className="w-3.5 h-3.5 shrink-0 text-sucesso-600" />
            : <Copy className="w-3.5 h-3.5 shrink-0" />}
          {copiado ? 'Link copiado' : 'Link do formulário'}
        </button>
      )}
      <a href="/modelo-importacao.xlsx" download="modelo-importacao.xlsx" className="btn btn-secundario btn-sm">
        <Download className="w-3.5 h-3.5 shrink-0" />
        Baixar modelo
      </a>
    </>
  )
}
