import { valorDaCelula, type FolhaDoc, type ColunaDoc, type LinhaDoc, type CelulaDoc } from '@/lib/relatorio-doc'

/**
 * As folhas A4 de um relatório no padrão do modelo (docs/modelo de relatorio .pdf): logo e o rótulo do evento no
 * topo, rótulo laranja + frase-resumo + aviso + tabela, e o rodapé "Credenciei · dados do sistema em … · página X de Y".
 * O estilo está em `Documento` (CSS próprio, em milímetros, pra a impressão sair igual ao modelo).
 */
export default function Folhas({ folhas, rotuloEvento, carimbo }: {
  folhas: FolhaDoc[]
  /** Canto superior direito: "VITAL · TURNO DE SÁBADO, 10/10". */
  rotuloEvento: string
  /** "dados do sistema em 11/10/2026 às 03h54". */
  carimbo: string
}) {
  return (
    <>
      {folhas.map((f, i) => (
        <section key={i} className="rd-folha">
          <header className="rd-topo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/logo-preto.png" alt="Credenciei" className="rd-logo" />
            <span className="rd-evento">{rotuloEvento}</span>
          </header>

          {f.blocos.map((b, bi) => (
            <div key={bi} className={bi ? 'rd-bloco rd-bloco-seguinte' : 'rd-bloco'}>
              {!b.continuacao ? (
                <>
                  <p className="rd-rotulo">{b.secao.rotulo}</p>
                  <h1 className="rd-titulo">{b.secao.titulo}</h1>
                  {b.secao.aviso && (
                    <p className="rd-aviso"><b>{b.secao.aviso.destaque}</b> {b.secao.aviso.texto}</p>
                  )}
                </>
              ) : (
                <p className="rd-rotulo rd-rotulo-continua">{b.secao.rotulo} · continuação</p>
              )}
              {b.linhas.length ? (
                <Tabela colunas={b.secao.colunas} linhas={b.linhas} />
              ) : (
                <p className="rd-vazio">{b.secao.vazio ?? 'Nada para mostrar.'}</p>
              )}
            </div>
          ))}

          <footer className="rd-rodape">Credenciei · {carimbo} · página {i + 1} de {folhas.length}</footer>
        </section>
      ))}
    </>
  )
}

function Tabela({ colunas, linhas }: { colunas: ColunaDoc[]; linhas: LinhaDoc[] }) {
  return (
    <table className="rd-tabela">
      <colgroup>{colunas.map((c, i) => <col key={i} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>
      <thead>
        <tr>{colunas.map((c, i) => <th key={i} className={alinhaDireita(c) ? 'rd-dir' : undefined}>{c.titulo}</th>)}</tr>
      </thead>
      <tbody>
        {linhas.map((l, li) => (
          <tr key={li}>
            {colunas.map((c, ci) => <Celula key={ci} coluna={c} valor={l[ci] ?? null} />)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const alinhaDireita = (c: ColunaDoc) => c.tipo === 'numero' || c.tipo === 'destaque' || c.tipo === 'barra'

function Celula({ coluna, valor: celula }: { coluna: ColunaDoc; valor: CelulaDoc }) {
  const valor = valorDaCelula(celula)
  const destacada = celula != null && typeof celula === 'object' && celula.destaque === true
  if (coluna.tipo === 'barra') {
    const p = typeof valor === 'number' && Number.isFinite(valor) ? Math.max(0, Math.min(1, valor)) : 0
    return (
      <td className="rd-dir">
        <span className="rd-barra"><span className="rd-barra-cheia" style={{ width: `${(p * 100).toFixed(1)}%` }} /></span>
      </td>
    )
  }
  const texto = valor == null || valor === '' ? '—' : typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor
  const classe = coluna.tipo === 'nome' ? 'rd-nome'
    : coluna.tipo === 'texto' ? 'rd-texto'
      : coluna.tipo === 'destaque' ? 'rd-dir rd-destaque'
        : 'rd-dir rd-numero'
  return <td className={destacada ? `${classe} rd-celula-destaque` : classe}>{texto}</td>
}
