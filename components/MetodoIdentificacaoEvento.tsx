import { ScanLine, ScanFace } from 'lucide-react'

/**
 * "Método de identificação" — QR Code / Biometria Facial / Biometria + QR.
 *
 * Compartilhado entre Novo Evento e Editar Evento pra não ter duas cópias do
 * mesmo texto explicativo divergindo com o tempo. Sem JavaScript nenhum:
 * são `<input type="radio">` nativos, o mesmo padrão do resto destes dois
 * formulários (eles não são componentes de cliente).
 *
 * O QR Code NUNCA fica indisponível, mesmo com "Biometria Facial"
 * selecionado — é o método de fallback, e o rótulo abaixo diz isso.
 */
const OPCOES = [
  {
    valor: 'qr',
    titulo: 'QR Code',
    icone: ScanLine,
    descricao: 'O acesso será validado através do QR Code da credencial.',
  },
  {
    valor: 'biometria',
    titulo: 'Biometria Facial',
    icone: ScanFace,
    descricao: 'O acesso será validado através do reconhecimento facial. O QR Code continua disponível no scanner como alternativa, caso a biometria não consiga identificar alguém.',
  },
  {
    valor: 'biometria_qr',
    titulo: 'Biometria Facial + QR Code',
    icone: ScanFace,
    descricao: 'O reconhecimento facial será utilizado como método principal. O QR Code ficará disponível como alternativa caso a biometria não consiga realizar a identificação.',
  },
] as const

export default function MetodoIdentificacaoEvento({
  defaultValue = 'qr', defaultTotem = true, defaultAutoatendimento = false,
}: {
  defaultValue?: string
  /** "Totem" aqui é qualquer aparelho fixo no portão (tablet, celular) — o /scan que já existe. */
  defaultTotem?: boolean
  /** O próprio funcionário bate a entrada pelo celular dele, na credencial — sem operador. */
  defaultAutoatendimento?: boolean
}) {
  return (
    <div className="border-t border-slate-100 pt-4 space-y-3" data-tutorial="evt-metodo-identificacao">
      <div>
        <p className="text-sm font-semibold text-slate-700">Método de identificação</p>
        <p className="text-xs text-slate-400">
          Como o portão reconhece cada pessoa. O QR Code nunca deixa de funcionar — mesmo nos
          modos de biometria, ele continua na credencial de todo mundo e disponível no scanner.
        </p>
      </div>
      <div className="grupo-metodo grid grid-cols-1 sm:grid-cols-3 gap-2">
        {OPCOES.map(o => (
          <label
            key={o.valor}
            className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-3 cursor-pointer has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <input
                // Hífen, não `_`: dentro de um valor arbitrário do Tailwind
                // (`[.grupo-metodo:has(#id:checked)~&]`, abaixo) o `_` vira
                // ESPAÇO literal no CSS gerado — "biometria_qr" quebraria o
                // seletor. O `value` do input (o que é salvo) continua com
                // underscore normalmente; só o `id`, usado só de gancho de
                // CSS, evita o caractere.
                id={`metodo-${o.valor.replace(/_/g, '-')}`}
                type="radio"
                name="metodo_identificacao"
                value={o.valor}
                defaultChecked={defaultValue === o.valor}
                className="accent-brand-500"
              />
              <o.icone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-sm font-semibold text-slate-800">{o.titulo}</span>
            </span>
            <span className="text-slate-500 text-2xs leading-snug">{o.descricao}</span>
          </label>
        ))}
      </div>

      {/*
        * Os DOIS jeitos de bater por biometria, cada um ligável — só aparece
        * (via CSS, sem JavaScript) quando um dos modos de biometria acima
        * está marcado. `&` no seletor arbitrário é ESTE bloco; `.grupo-metodo`
        * é o irmão anterior (o grid dos 3 radios) — `:has()` nele detectando
        * qual radio está marcado é o que liga o `display:block` aqui.
        */}
      <div className="hidden [.grupo-metodo:has(#metodo-biometria:checked)~&]:block [.grupo-metodo:has(#metodo-biometria-qr:checked)~&]:block border-t border-slate-100 pt-3 space-y-2">
        <p className="text-xs font-semibold text-slate-600">Como a biometria pode ser feita</p>
        <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 cursor-pointer has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/50">
          <input type="checkbox" name="biometria_totem" value="on" defaultChecked={defaultTotem} className="mt-0.5 accent-brand-500" />
          <span>
            <span className="block text-sm font-semibold text-slate-800">No portão (tablet/celular fixo)</span>
            <span className="block text-slate-500 text-2xs leading-snug">
              Quem credencia aponta o aparelho pro rosto da pessoa — o Scanner que já existe, com o rosto no lugar do QR.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 cursor-pointer has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/50">
          <input type="checkbox" name="biometria_autoatendimento" value="on" defaultChecked={defaultAutoatendimento} className="mt-0.5 accent-brand-500" />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Pelo próprio celular da pessoa</span>
            <span className="block text-slate-500 text-2xs leading-snug">
              Na credencial dela, sem ninguém segurando o aparelho — só a ENTRADA; a saída continua exigindo o QR ou o portão.
              Pede localização no dia do evento.
            </span>
          </span>
        </label>
      </div>
    </div>
  )
}
