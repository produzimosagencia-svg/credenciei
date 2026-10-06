import { QrCode } from 'lucide-react'

export default function LinkIndisponivel({ motivo }: { motivo: 'invalido' | 'expirado' }) {
  return (
    <main className="min-h-dvh bg-[#0a0918] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="logo-marca w-9 h-9 rounded-lg flex items-center justify-center"><QrCode className="w-4 h-4 text-white" /></div>
          <span className="font-bold text-white text-lg">Credenciei</span>
        </div>
        <h1 className="text-white text-2xl font-bold">
          {motivo === 'expirado' ? 'Este link expirou' : 'Link inválido'}
        </h1>
        <p className="text-white/60 text-sm mt-2">
          {motivo === 'expirado'
            ? 'O prazo de acesso a estas conversas terminou. Peça um link novo a quem enviou este.'
            : 'Confira se o endereço foi copiado inteiro ou peça um link novo a quem enviou este.'}
        </p>
      </div>
    </main>
  )
}
