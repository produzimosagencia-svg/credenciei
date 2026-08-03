// Avatar circular da organização — foto (se tiver) ou iniciais do nome
// como fallback. Puramente apresentacional, sem estado (dá pra usar tanto
// em server components quanto client).
function iniciaisOrg(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  const letras = partes.length > 1 ? partes[0][0] + partes[1][0] : partes[0].slice(0, 2)
  return letras.toUpperCase()
}

export default function OrganizacaoAvatar({
  url,
  nome,
  size = 40,
}: {
  url: string | null
  nome: string
  size?: number
}) {
  const estilo = { width: size, height: size }
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={nome} style={estilo} className="rounded-full object-cover border border-slate-200 shrink-0" />
  }
  return (
    <div
      style={estilo}
      className="rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold shrink-0"
    >
      <span style={{ fontSize: Math.max(11, size * 0.36) }}>{iniciaisOrg(nome)}</span>
    </div>
  )
}
