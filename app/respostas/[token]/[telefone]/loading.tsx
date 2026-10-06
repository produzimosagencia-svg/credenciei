import estilos from '../chat.module.css'

/**
 * O que aparece no lugar da conversa enquanto ela é buscada. Com isto o clique
 * na lista responde na hora, em vez de a tela ficar parada até o servidor
 * devolver as mensagens.
 */
export default function CarregandoConversa() {
  const blocos = [
    { lado: 'justify-start', largura: 'w-56', altura: 'h-12' },
    { lado: 'justify-start', largura: 'w-72', altura: 'h-16' },
    { lado: 'justify-end', largura: 'w-48', altura: 'h-12' },
    { lado: 'justify-start', largura: 'w-40', altura: 'h-12' },
  ]
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Carregando conversa">
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#161526] px-4 py-3">
        <span className={`h-10 w-10 rounded-full ${estilos.esqueleto}`} />
        <span className="space-y-2">
          <span className={`block h-3.5 w-40 rounded-full ${estilos.esqueleto}`} />
          <span className={`block h-2.5 w-24 rounded-full ${estilos.esqueleto}`} />
        </span>
      </div>
      <div className={`flex-1 space-y-3 p-4 lg:p-6 ${estilos.fundo}`}>
        {blocos.map((b, i) => (
          <div key={i} className={`flex ${b.lado}`}>
            <span className={`${b.largura} ${b.altura} max-w-[80%] rounded-2xl ${estilos.esqueleto}`} />
          </div>
        ))}
      </div>
    </div>
  )
}
