import { ScanFace, CheckCircle2, Ruler, ArrowLeftRight } from 'lucide-react'
import { Secao, Badge, EmptyState, type TomBadge } from '@/components/ui/Superficie'
import StatCard from '@/components/StatCard'
import { formatarBR } from '@/lib/tz'
import type { RelatorioBiometria } from '@/lib/biometria-relatorio'

/**
 * O texto que a pessoa vê nunca aparece aqui de novo (ver `MENSAGEM_POR_MOTIVO`
 * em lib/biometria.ts) — isto é o rótulo pro ADMIN entender o motivo técnico
 * de cada linha, coisa que a pessoa que bateu o ponto nunca precisa saber.
 */
const ROTULO_RESULTADO: Record<string, string> = {
  sucesso: 'Reconhecido',
  negado: 'Reconhecido, acesso negado',
  acima_do_limiar: 'Não bateu com ninguém',
  ambiguo: 'Ambíguo — dois candidatos parecidos',
  sem_candidatos: 'Ninguém cadastrado ainda',
  qualidade_baixa: 'Imagem de baixa qualidade',
  nenhum_rosto: 'Nenhum rosto encontrado',
  multiplos_rostos: 'Mais de um rosto na câmera',
  sem_localizacao: 'Sem localização',
  erro: 'Erro técnico',
}

const rotular = (resultado: string) => ROTULO_RESULTADO[resultado] ?? resultado

function tomDoResultado(resultado: string): TomBadge {
  if (resultado === 'sucesso') return 'positivo'
  if (resultado === 'negado' || resultado === 'erro') return 'negativo'
  if (resultado === 'sem_candidatos') return 'neutro'
  return 'atencao'
}

export default function RelatorioBiometriaView({ relatorio }: { relatorio: RelatorioBiometria }) {
  const sucesso = relatorio.porResultado.find(r => r.resultado === 'sucesso')
  const taxaSucesso = relatorio.total ? Math.round(((sucesso?.quantidade ?? 0) / relatorio.total) * 100) : null

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Tentativas" value={relatorio.total} icon={ScanFace} />
        <StatCard
          label="Reconhecidos"
          value={sucesso?.quantidade ?? 0}
          icon={CheckCircle2}
          tom="sucesso"
          sub={taxaSucesso !== null ? `${taxaSucesso}% das tentativas` : undefined}
        />
        <StatCard label="Limiar atual" value={relatorio.limiarAtual.toFixed(2)} icon={Ruler} sub="distância máxima aceita" />
        <StatCard label="Margem mínima" value={relatorio.margemAtual.toFixed(2)} icon={ArrowLeftRight} sub="entre 1º e 2º candidato" />
      </div>

      <Secao
        titulo="Por resultado"
        descricao="Quantas tentativas caíram em cada motivo, e a distância medida (quanto MENOR, mais parecido — abaixo do limiar é reconhecido)"
      >
        {!relatorio.porResultado.length ? (
          <EmptyState
            icone={<ScanFace className="w-7 h-7" />}
            titulo="Nenhuma tentativa ainda"
            descricao="Assim que alguém usar a biometria neste evento, os números aparecem aqui."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr><th>Resultado</th><th>Quantidade</th><th>Distância mínima</th><th>Distância média</th><th>Distância máxima</th></tr>
              </thead>
              <tbody>
                {relatorio.porResultado.map(r => (
                  <tr key={r.resultado}>
                    <td><Badge tom={tomDoResultado(r.resultado)}>{rotular(r.resultado)}</Badge></td>
                    <td className="tabular-nums">{r.quantidade}</td>
                    <td className="tabular-nums text-slate-500">{r.distanciaMinima?.toFixed(3) ?? '—'}</td>
                    <td className="tabular-nums text-slate-500">{r.distanciaMedia?.toFixed(3) ?? '—'}</td>
                    <td className="tabular-nums text-slate-500">{r.distanciaMaxima?.toFixed(3) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao titulo="Tentativas recentes" descricao={`As últimas ${relatorio.recentes.length} leituras, mais novas primeiro`}>
        {!relatorio.recentes.length ? (
          <EmptyState icone={<ScanFace className="w-7 h-7" />} titulo="Nenhuma tentativa ainda" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr><th>Quando</th><th>Resultado</th><th>Pessoa</th><th>Distância</th><th>Duração</th></tr>
              </thead>
              <tbody>
                {relatorio.recentes.map(l => (
                  <tr key={l.id}>
                    <td className="text-slate-500 tabular-nums whitespace-nowrap">
                      {formatarBR(l.criadoEm, 'curto')} {formatarBR(l.criadoEm, 'hora')}
                    </td>
                    <td><Badge tom={tomDoResultado(l.resultado)}>{rotular(l.resultado)}</Badge></td>
                    <td className="text-slate-600 text-xs">{l.funcionarioNome ?? '—'}</td>
                    <td className="tabular-nums text-slate-500">{l.distancia?.toFixed(3) ?? '—'}</td>
                    <td className="tabular-nums text-slate-500">{l.duracaoMs ? `${(l.duracaoMs / 1000).toFixed(1)}s` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </div>
  )
}
