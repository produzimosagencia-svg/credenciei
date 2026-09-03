'use client'
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

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
 *
 * "Baixar modelo" NÃO entra aqui: ele já vem dentro de `ImportarFuncionarios`,
 * que fica ao lado nesta mesma barra — ter os dois deixava o botão duplicado
 * lado a lado na tela do supervisor.
 */
export default function AcoesDaEquipe({
  tokenFormulario, setorNome,
}: {
  tokenFormulario: string | null
  /** Vai junto no texto copiado — ver o comentário em `copiar`. */
  setorNome?: string
}) {
  const [copiado, setCopiado] = useState(false)

  /*
   * Copia o NOME DO SETOR junto com o link, não só a URL.
   *
   * O link vai colado num grupo de WhatsApp, e sozinho ele é cru: quem
   * recebe não sabe de qual setor é aquele cadastro — e o organizador
   * manda vários links diferentes, um por setor, no mesmo dia. Com o
   * nome na frente, a mensagem já chega dizendo o que é.
   */
  const copiar = () => {
    if (!tokenFormulario) return
    const url = `${window.location.origin}/form/${tokenFormulario}`
    navigator.clipboard.writeText(setorNome ? `${setorNome} — cadastro da equipe:\n${url}` : url)
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
    </>
  )
}
