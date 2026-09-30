'use client'
import { useState } from 'react'
import { ScanFace, Check, AlertCircle } from 'lucide-react'
import FaceCapture, { type ResultadoCaptura } from '@/components/FaceCapture'
import { completarBiometriaPublica } from '@/lib/actions'

/**
 * Rede de segurança: aparece só pra quem o evento usa biometria e ainda não
 * tem rosto cadastrado NESTE evento — pulou no formulário, a câmera falhou,
 * ou o rosto já existia em outro evento e foi reaproveitado sozinho (nesse
 * caso este cartão nem aparece, ver `page.tsx`).
 *
 * Mesmo componente de câmera (`FaceCapture`) usado em todo canto; a ação
 * (`completarBiometriaPublica`) usa o mesmo token da credencial como
 * segredo, sem sessão — igual a `registrarPresencaFacialLivre`.
 */
export default function CadastrarBiometriaCard({ token }: { token: string }) {
  const [capturando, setCapturando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<{ reaproveitada: boolean } | null>(null)

  const aoCapturar = async ({ descritor }: ResultadoCaptura) => {
    setCapturando(false)
    setEnviando(true)
    setErro(null)
    try {
      const r = await completarBiometriaPublica(token, descritor)
      if (r.ok) setFeito({ reaproveitada: !!r.reaproveitada })
      else setErro(r.error ?? 'Não foi possível cadastrar agora. Tente de novo.')
    } catch {
      setErro('Não foi possível cadastrar agora. Confira sua internet e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  if (feito) {
    return (
      <div className="rounded-2xl border border-green-100 bg-green-50 p-4 flex items-start gap-2.5">
        <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
        <p className="text-green-800 text-sm leading-relaxed">
          {feito.reaproveitada
            ? 'O rosto que você já tinha cadastrado em outro evento foi vinculado a este evento.'
            : 'Rosto cadastrado! Você já pode entrar e sair só olhando para a câmera do portão.'}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2.5">
        <p className="flex items-center gap-2 text-amber-800 font-bold text-sm">
          <ScanFace className="w-4 h-4 shrink-0" /> Falta cadastrar seu rosto
        </p>
        <p className="text-amber-900/80 text-xs leading-relaxed">
          Cadastre agora pra entrar e sair do evento só olhando para a câmera do portão, sem precisar mostrar o QR Code.
        </p>
        {erro && (
          <p className="flex items-start gap-1.5 text-red-600 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
          </p>
        )}
        <button
          type="button"
          onClick={() => setCapturando(true)}
          disabled={enviando}
          className="w-full bg-amber-500 text-white font-bold rounded-xl py-2.5 text-sm active:scale-95 transition-all disabled:opacity-60"
        >
          {enviando ? 'Enviando...' : 'Cadastrar meu rosto agora'}
        </button>
      </div>

      {capturando && (
        <FaceCapture
          instrucao="Olhe para a câmera para cadastrar seu rosto"
          onCaptura={aoCapturar}
          onCancelar={() => setCapturando(false)}
        />
      )}
    </>
  )
}
