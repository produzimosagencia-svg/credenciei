'use client'
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function CopyLinkButton({ link, label = 'Copiar link' }: { link: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      title={link}
      className="flex items-center gap-1.5 text-xs px-3 py-2 bg-[#21262d] hover:bg-[#30363d] text-slate-300 rounded-lg transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copiado!' : label}
    </button>
  )
}
