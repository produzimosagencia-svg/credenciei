'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * As abas do painel.
 *
 * Cliente só por causa do `usePathname` — marcar a aba ativa no servidor
 * exigiria passar a rota por prop de cada página, e uma esquecida deixaria a
 * navegação sem indicar onde a pessoa está.
 */
export default function AbasWhatsApp({ abas }: { abas: { href: string; label: string }[] }) {
  const pathname = usePathname()

  return (
    <nav className="abas" aria-label="Seções do WhatsApp">
      {abas.map(a => {
        // A visão geral é a raiz: sem a comparação exata, ela ficaria acesa em
        // todas as abas, já que toda rota começa por ela.
        const ativa = a.href === '/admin/whatsapp'
          ? pathname === a.href
          : pathname.startsWith(a.href)
        return (
          <Link key={a.href} href={a.href} className={`aba ${ativa ? 'aba-ativa' : ''}`} aria-current={ativa ? 'page' : undefined}>
            {a.label}
          </Link>
        )
      })}
    </nav>
  )
}
