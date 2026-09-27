'use client'
import { useState } from 'react'
import { ScanFace, ShieldCheck, Check, X } from 'lucide-react'
import { consentirBiometria, cadastrarBiometria } from '@/lib/actions'
import FaceCapture from './FaceCapture'

/*
 * Cadastro de rosto — assistido, no portão (por quem já está autenticado e
 * já tem a pessoa na frente: supervisor ou operador, mesma régua de
 * `podeEscanear`). É a mesma confiança já usada no registro assistido por
 * foto, que já existe neste sistema.
 *
 * O CONSENTIMENTO é da PESSOA, não do operador — por isso a tela abaixo é
 * escrita pra ELA ler, e é o toque DELA que chama `consentirBiometria`,
 * antes de a câmera abrir. O operador segura o aparelho; quem aceita é
 * quem está sendo cadastrado.
 *
 * Aviso honesto: este é um consentimento assistido, simples — não substitui
 * uma revisão jurídica/DPO completa (retenção, revogação, texto formal do
 * termo). Ver a seção de LGPD do estudo em c:\Dev\credenciei-biometria antes
 * de usar isto com clientes fora de teste.
 */

type Passo = 'consentimento' | 'camera' | 'salvando' | 'sucesso' | 'erro'

export default function CadastroBiometrico({
  funcionarioId, eventoId, nome, aoFechar,
}: {
  funcionarioId: string
  eventoId: string
  nome: string
  aoFechar: () => void
}) {
  const [passo, setPasso] = useState<Passo>('consentimento')
  const [erro, setErro] = useState<string | null>(null)

  const autorizar = async () => {
    const r = await consentirBiometria(funcionarioId, eventoId)
    if (r.error) { setErro(r.error); setPasso('erro'); return }
    setPasso('camera')
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <span className="flex items-center gap-2 text-white font-semibold text-sm">
          <ScanFace className="w-4 h-4" /> Cadastro de biometria facial
        </span>
        <button onClick={aoFechar} className="text-slate-400 hover:text-white" aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>
      </div>

      {passo === 'consentimento' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 text-center">
          <ShieldCheck className="w-12 h-12 text-brand-400" />
          <div className="max-w-sm space-y-3">
            <p className="text-white text-lg font-bold">{nome}, este cadastro é seu</p>
            <p className="text-slate-300 text-sm leading-relaxed">
              Pra facilitar sua entrada e saída neste evento, o sistema pode reconhecer seu rosto
              em vez de pedir o QR Code toda vez. Isto é opcional: se você preferir, continue
              usando só o QR Code normalmente — nada muda pra você.
            </p>
            <p className="text-slate-400 text-xs leading-relaxed">
              Se você concordar, seu rosto é transformado em um código (não uma foto) e guardado
              só para reconhecer você <strong>neste evento</strong> — não em outros eventos, e não
              é usado pra mais nada. Você pode pedir pra apagar quando quiser.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 w-full max-w-xs">
            <button
              onClick={autorizar}
              className="w-full bg-brand-500 text-white font-bold rounded-2xl py-4 active:scale-95 transition-all"
            >
              Autorizo o reconhecimento facial
            </button>
            <button onClick={aoFechar} className="w-full text-slate-400 text-sm font-semibold py-2">
              Prefiro continuar só com QR Code
            </button>
          </div>
        </div>
      )}

      {passo === 'camera' && (
        <FaceCapture
          instrucao="Olhe para a câmera para cadastrar seu rosto"
          onCancelar={aoFechar}
          onCaptura={async ({ descritor }) => {
            setPasso('salvando')
            const r = await cadastrarBiometria(funcionarioId, eventoId, descritor)
            if (r.error) { setErro(r.error); setPasso('erro'); return }
            setPasso('sucesso')
          }}
        />
      )}

      {passo === 'salvando' && (
        <div className="flex-1 flex items-center justify-center text-white">Salvando…</div>
      )}

      {passo === 'sucesso' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="w-8 h-8 text-white" />
          </div>
          <p className="text-white text-lg font-bold">Rosto cadastrado!</p>
          <p className="text-slate-400 text-sm max-w-xs">
            {nome} já pode entrar e sair só olhando para a câmera do portão. O QR Code continua funcionando também.
          </p>
          <button onClick={aoFechar} className="mt-2 bg-white text-slate-900 font-bold rounded-2xl px-6 py-3">
            Concluir
          </button>
        </div>
      )}

      {passo === 'erro' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-red-300 text-sm max-w-xs">{erro ?? 'Não foi possível cadastrar agora.'}</p>
          <button onClick={() => setPasso('consentimento')} className="text-white text-sm font-semibold underline">
            Tentar de novo
          </button>
          <button onClick={aoFechar} className="text-slate-400 text-sm">Fechar</button>
        </div>
      )}
    </div>
  )
}
