'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle, AlertCircle, Download, Sparkles } from 'lucide-react'
import { LogoLoading } from '@/components/LogoLoading'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { lerPlanilhaDeEquipe, ErroNaPlanilha, type LinhaPlanilha } from '@/lib/planilha'
import { formatCpf } from '@/lib/format'
import type { LinhaIgnorada } from '@/lib/importacao'
// xlsx é pesado e só é usado no download do modelo aqui (a leitura mora em
// lib/planilha) — carregado sob demanda pra não engordar o bundle da página.

type Status = { ok: boolean; total?: number; invalidos?: number; duplicados?: number; reaproveitados?: number; error?: string; ignorados?: LinhaIgnorada[] } | null

/**
 * Duas aparências, o mesmo comportamento:
 *   'botao' — o botão solto, como na tela da equipe do setor;
 *   'item'  — linha de menu, dentro do modal de planilhas do card do setor,
 *             onde as três ações de planilha foram reunidas.
 */
export default function ImportarFuncionarios({
  fornecedorId, variante = 'botao',
}: {
  fornecedorId: string
  variante?: 'botao' | 'item'
}) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setStatus(null)
    /*
     * Cada etapa com a sua mensagem — o que aconteceu E o que fazer (Juan, 16/10/2026). Antes qualquer falha, até
     * a internet caindo no meio do envio, aparecia como "Erro ao ler o arquivo".
     */
    const terminar = (s: Status) => {
      setStatus(s)
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }

    // 1 · Ler a planilha (no próprio aparelho).
    let funcionarios: LinhaPlanilha[]
    try {
      funcionarios = await lerPlanilhaDeEquipe(file)
    } catch (e) {
      terminar({ ok: false, error: e instanceof ErroNaPlanilha ? e.message : 'Não consegui ler este arquivo. Salve a planilha como Excel (.xlsx) ou CSV e importe de novo — ou use o modelo (botão "Baixar modelo").' })
      return
    }
    if (funcionarios.length === 0) {
      terminar({ ok: false, error: 'Não achei ninguém na planilha. A equipe começa na linha 2, logo abaixo dos títulos (Nome, CPF, Telefone). Confira o arquivo ou use o modelo (botão "Baixar modelo").' })
      return
    }

    // 2 · Enviar.
    let res: Response
    try {
      res = await fetch('/api/import/funcionarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fornecedorId, funcionarios }),
      })
    } catch {
      terminar({ ok: false, error: 'A conexão caiu no envio. Confira a internet e importe a mesma planilha de novo — quem já entrou não é cadastrado duas vezes.' })
      return
    }

    // 3 · A resposta. Sem JSON = o servidor não respondeu direito (demorou demais, caiu no meio).
    let json: (Status & { error?: string }) | null = null
    try { json = await res.json() } catch { json = null }
    router.refresh()
    if (!json) {
      terminar({ ok: false, error: 'O sistema demorou para responder. Espere 1 minuto, abra a equipe para ver quem já entrou e importe a mesma planilha de novo — quem já entrou não é cadastrado duas vezes. Se repetir, chame o suporte pelo WhatsApp.' })
      return
    }
    if (res.ok) {
      terminar({ ok: true, total: json.total, invalidos: json.invalidos, duplicados: json.duplicados, reaproveitados: json.reaproveitados, ignorados: json.ignorados })
    } else {
      // Recarrega também na recusa (acima): "já cadastrado" quer dizer que a pessoa EXISTE, e a lista aberta pode estar desatualizada.
      terminar({ ok: false, error: json.error ?? 'Não foi possível importar. Tente de novo em alguns instantes; se repetir, chame o suporte pelo WhatsApp.', ignorados: json.ignorados })
    }
  }

  // O modelo é gerado na hora para ESTE setor: as perguntas do formulário e, com escala, os dias do evento (09/10/2026).
  const urlDoModelo = `/api/import/modelo?fornecedor=${encodeURIComponent(fornecedorId)}`

  const entrada = <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />

  return (
    <div className={variante === 'item' ? 'space-y-1' : 'flex flex-col gap-2'}>
      {loading && <LoadingOverlay mensagem="Importando funcionários..." />}

      {variante === 'item' ? (
        <>
          <button onClick={() => fileRef.current?.click()} disabled={loading} className="linha-acao">
            {loading
              ? <LogoLoading tamanho="xs" />
              : <Upload className="w-4 h-4 shrink-0 text-brand-500" />}
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-800">
                {loading ? 'Importando…' : 'Importar lista'}
              </span>
              <span className="block text-slate-400 text-xs">
                Sobe uma planilha e cadastra a equipe de uma vez
              </span>
            </span>
          </button>
          <a href={urlDoModelo} download className="linha-acao">
            <Download className="w-4 h-4 shrink-0 text-brand-500" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-800">Baixar modelo</span>
              <span className="block text-slate-400 text-xs">As perguntas do formulário e os dias deste evento</span>
            </span>
          </a>
          {entrada}
        </>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="btn btn-secundario btn-sm"
          >
            {loading
              ? <LogoLoading tamanho={14} />
              : <Upload className="w-3.5 h-3.5 shrink-0" />
            }
            {loading ? 'Importando...' : 'Importar planilha'}
          </button>
          <a
            href={urlDoModelo}
            download
            className="btn btn-secundario btn-sm"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            Baixar modelo
          </a>
          {entrada}
        </div>
      )}

      {status && (
        <div className="space-y-1">
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${status.ok ? 'text-green-600' : 'text-red-500'}`}>
            {status.ok
              ? <><CheckCircle className="w-3 h-3 shrink-0" /> {status.total} funcionário{status.total !== 1 ? 's' : ''} importado{status.total !== 1 ? 's' : ''}!</>
              : <><AlertCircle className="w-3 h-3 shrink-0" /> {status.error}</>
            }
          </div>
          {status.ok && !!status.invalidos && (
            <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg text-amber-600">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {status.invalidos} linha{status.invalidos !== 1 ? 's' : ''} com CPF fora do formato (precisa ter 11 dígitos) {status.invalidos !== 1 ? 'foram ignoradas' : 'foi ignorada'}. Corrija na planilha e importe de novo.
            </div>
          )}
          {status.ok && !!status.reaproveitados && (
            <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg text-brand-600">
              <Sparkles className="w-3 h-3 shrink-0" />
              {status.reaproveitados} já {status.reaproveitados !== 1 ? 'estavam' : 'estava'} na nossa base — completamos telefone, cargo e PIX que faltavam na planilha.
            </div>
          )}
          {!!status.ignorados?.length && (
            <div className="text-xs px-2 py-1.5 rounded-lg text-amber-700 bg-amber-50 space-y-1.5">
              <p className="flex items-start gap-1.5 font-medium">
                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                {status.ignorados.length} linha{status.ignorados.length !== 1 ? 's' : ''} não {status.ignorados.length !== 1 ? 'foram importadas' : 'foi importada'}:
              </p>
              <p className="text-amber-800">
                O que fazer: corrija essas linhas na planilha e importe a mesma planilha de novo — quem já entrou não é cadastrado duas vezes.
              </p>
              {/* Rola: com planilha grande a lista passa de 30 linhas, e sem
                  altura o aviso empurrava o resto do modal pra fora da tela. */}
              <ul className="max-h-40 overflow-y-auto space-y-0.5 pl-4">
                {status.ignorados.map((f, i) => (
                  <li key={`${f.cpf}-${i}`} className="text-amber-800">
                    {f.nome || 'Sem nome na planilha'} — CPF: {f.cpf ? formatCpf(f.cpf) : '—'}
                    {f.motivo === 'cpf_invalido' ? (
                      <span className="text-amber-600"> (CPF inválido — confira os números na planilha)</span>
                    ) : f.motivo === 'cota_atingida' ? (
                      <span className="text-amber-600"> (o fornecedor chegou ao máximo de pessoas — peça ao administrador para aumentar a quantidade)</span>
                    ) : f.motivo === 'sem_dias' ? (
                      <span className="text-amber-600"> (nenhum dia de trabalho marcado — marque X nos dias)</span>
                    ) : f.motivo === 'sem_telefone' ? (
                      <span className="text-amber-600"> (sem telefone — preencha com DDD na planilha)</span>
                    ) : f.motivo === 'sem_nome' ? (
                      <span className="text-amber-600"> (sem nome — preencha o nome completo na planilha)</span>
                    ) : f.motivo === 'sem_cpf' ? (
                      <span className="text-amber-600"> (sem CPF — preencha o CPF na planilha)</span>
                    ) : f.motivo === 'dia_lotado' ? (
                      <span className="text-amber-600"> ({f.detalhe ?? 'um dos dias'} já no limite de pessoas do setor)</span>
                    ) : f.setor ? (
                      <span className="text-amber-600"> (já está em {f.setor} — se mudou de equipe, use &quot;Mover&quot; na ficha dela)</span>
                    ) : (
                      <span className="text-amber-600"> (repetido na própria planilha — entrou uma vez só)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
