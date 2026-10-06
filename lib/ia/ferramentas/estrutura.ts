import { supabaseAdmin } from '@/lib/supabase-server'
import { previaImportacaoEstrutura, importarEstruturaLote } from '@/lib/actions'
import {
  limparNome, normalizarCpfPlanilha, normalizarNome,
  type LinhaEstrutura, type ResultadoLinhaEstrutura,
} from '@/lib/estrutura-regras'
import { registrarAuditoriaIA } from '../auditoria'
import {
  ferramenta, exigirGestor, eventosVisiveis,
  type ContextoIA, type PedirConfirmacao, type PerfilIA, type Resolucao,
} from './base'

/**
 * Importar a ESTRUTURA do evento pelo chat — a mesma importação do botão
 * "Importar planilha de estrutura" da tela do evento
 * (app/admin/eventos/[id]/ImportarEstrutura.tsx), só que pedida em conversa.
 *
 * Nenhuma regra mora aqui: prévia e gravação são as MESMAS server actions da
 * tela (`previaImportacaoEstrutura` / `importarEstruturaLote`), que refazem a
 * checagem de permissão pela sessão. Se a regra mudar lá, o chat acompanha
 * sem ninguém lembrar de mexer aqui.
 *
 * Privacidade: as linhas (com CPF e telefone dos supervisores) chegam do
 * navegador e vão direto pras actions. O modelo só vê o resumo de
 * `resumirEstrutura` e contagens — mesmo motivo de lib/planilha.ts: CPF
 * transcrito por modelo volta com dígito trocado.
 */

/** Linhas por chamada de `importarEstruturaLote` — a mesma leva da tela. */
const LEVA = 5

/**
 * Tempo máximo gravando numa volta só. A rota tem maxDuration 120s, e antes
 * da ferramenta o modelo já gastou alguns segundos; depois dela ainda precisa
 * escrever o resumo. Passou disso, para e devolve o ponto de retomada — o
 * que já entrou não duplica, então continuar depois é seguro.
 */
const ORCAMENTO_MS = 80_000

/** Quantos nomes de área/fornecedor o modelo recebe no resumo. */
const MAX_NOMES_NO_RESUMO = 30

/**
 * O que o modelo sabe da planilha de estrutura anexada: contagens e os nomes
 * de áreas e fornecedores (que não são dado pessoal). Supervisor só entra
 * como CONTAGEM de CPFs distintos — nem o CPF, nem o telefone.
 */
export function resumirEstrutura(linhas: LinhaEstrutura[]) {
  const distintos = (vals: string[]) => {
    const porChave = new Map<string, string>()
    for (const v of vals) {
      const limpo = limparNome(v)
      if (limpo && !porChave.has(normalizarNome(limpo))) porChave.set(normalizarNome(limpo), limpo)
    }
    return [...porChave.values()]
  }
  const subgrupos = distintos(linhas.map(l => l.subgrupo))
  const fornecedores = distintos(linhas.map(l => l.fornecedor))
  return {
    linhas: linhas.length,
    subgrupos_total: subgrupos.length,
    subgrupos: subgrupos.slice(0, MAX_NOMES_NO_RESUMO),
    fornecedores_total: fornecedores.length,
    fornecedores: fornecedores.slice(0, MAX_NOMES_NO_RESUMO),
    supervisores_distintos: new Set(linhas.map(l => normalizarCpfPlanilha(l.supervisorCpf)).filter(Boolean)).size,
    linhas_sem_trava: linhas.filter(l => !String(l.trava ?? '').trim()).length,
  }
}

/**
 * Acha o evento pelo id OU pelo nome, só entre os que esta pessoa enxerga.
 *
 * Aceitar o nome poupa uma volta do modelo ("importa no Vital" vira chamada
 * direta) sem abrir nada: a busca roda dentro de `eventosVisiveis`, então um
 * nome de evento de outra organização simplesmente não é achado.
 */
async function resolverEvento(perfil: PerfilIA, evento: string): Promise<Resolucao<{ ev: { id: string; nome: string } }>> {
  const ids = await eventosVisiveis(perfil)
  if (!ids.length) return { ok: false, erro: 'Você não tem nenhum evento no seu acesso.' }
  const { data } = await supabaseAdmin.from('eventos').select('id, nome').in('id', ids)
  const eventos = (data ?? []) as { id: string; nome: string }[]

  const termo = String(evento ?? '').trim()
  const porId = eventos.find(e => e.id === termo)
  if (porId) return { ok: true, erro: null, ev: porId }

  const alvo = normalizarNome(termo)
  if (!alvo) return { ok: false, erro: 'Diga em qual evento importar a estrutura.' }
  const exatos = eventos.filter(e => normalizarNome(e.nome) === alvo)
  const parecidos = exatos.length ? exatos : eventos.filter(e => normalizarNome(e.nome).includes(alvo))
  if (parecidos.length === 1) return { ok: true, erro: null, ev: parecidos[0] }
  if (!parecidos.length) {
    return { ok: false, erro: `Não achei nenhum evento chamado "${termo}" no seu acesso. Use listar_eventos para conferir o nome.` }
  }
  return {
    ok: false,
    erro: `Mais de um evento combina com "${termo}": ${parecidos.slice(0, 8).map(e => e.nome).join('; ')}. Pergunte ao usuário qual é.`,
  }
}

export function ferramentasDeEstrutura(ctx: ContextoIA, pedirConfirmacao: PedirConfirmacao) {
  const { perfil, confirmacoes } = ctx

  return [
    ferramenta({
      nome: 'importar_estrutura_evento',
      descricao:
        'Importa a PLANILHA DE ESTRUTURA anexada nesta conversa (Fornecedor | Subgrupo | Trava do setor por dia | Supervisor) num evento: ' +
        'cria as áreas (subgrupos) que faltarem, cria ou atualiza cada fornecedor dentro da área, grava a trava por dia e dá acesso ao supervisor de cada um. ' +
        'Use SEMPRE que houver planilha de estrutura anexada — nunca crie setor ou supervisor um a um a partir dela. ' +
        'Você não vê CPFs nem telefones, e não precisa: o sistema lê o arquivo e confere tudo. ' +
        'A primeira chamada mostra a prévia (o que será criado/atualizado e as linhas com erro) e pede confirmação. ' +
        'Se a resposta trouxer "continuar_da_linha", a importação parou pelo tempo: explique quantas linhas faltam e, quando o usuário pedir pra continuar, chame de novo passando esse número.',
      parametros: {
        type: 'object',
        properties: {
          evento: { type: 'string', description: 'id ou nome do evento que recebe a estrutura' },
          continuar_da_linha: {
            type: 'number',
            description: 'só para retomar uma importação interrompida: o valor de "continuar_da_linha" que a chamada anterior devolveu',
          },
        },
        required: ['evento'],
      },
      executar: async ({ evento, continuar_da_linha }) => {
        const inicio = Date.now()
        const barrado = exigirGestor(perfil, 'importa a estrutura do evento')
        if (barrado) return barrado

        const linhas = ctx.estrutura
        if (!linhas?.length) {
          return 'Não há planilha de estrutura anexada nesta conversa. Peça para a pessoa anexar o arquivo (colunas Fornecedor, Subgrupo, Trava do setor por dia, Nome/CPF/Telefone Supervisor) no clipe ao lado do campo de mensagem e mandar de novo.'
        }

        const r = await resolverEvento(perfil, evento)
        if (!r.ok) return r.erro
        const eventoId = r.ev.id

        // A prévia é a da tela: nada gravado, e a permissão é refeita pela
        // sessão lá dentro (só quem cria acessos importa estrutura).
        const previa = await previaImportacaoEstrutura(eventoId, linhas)
        if (!previa.ok) return previa.error
        const { plano, eventoNome } = previa
        const c = plano.contagens

        const desde = Number.isFinite(Number(continuar_da_linha)) && Number(continuar_da_linha) > 0
          ? Math.floor(Number(continuar_da_linha)) : null
        const errosDaPrevia = plano.linhas
          .filter(l => l.acao === 'erro' && (desde == null || l.linha >= desde))
          .map(l => ({ linha: l.linha, erro: l.erros.join(' ') }))
        const aGravar = plano.linhas
          .filter(l => l.acao !== 'erro' && (desde == null || l.linha >= desde))
          .map(l => l.linha)

        if (!aGravar.length) {
          return JSON.stringify({
            ok: false,
            evento: eventoNome,
            motivo: desde == null
              ? 'Nenhuma linha da planilha pode entrar: todas têm erro. Corrija e anexe de novo.'
              : `Não sobrou nenhuma linha válida a partir da linha ${desde}.`,
            erros: errosDaPrevia.slice(0, 30),
            total_de_erros: errosDaPrevia.length,
          })
        }

        // A operação carrega evento + contagem (+ ponto de retomada): trocar o
        // arquivo ou o evento depois de confirmar não reaproveita o clique
        // antigo, e retomar pede um clique novo, com o que falta à vista.
        const operacao = `importar_estrutura_evento:${eventoId}:${linhas.length}${desde != null ? `:${desde}` : ''}`
        if (!confirmacoes.has(operacao)) {
          const impacto: Record<string, unknown> = desde == null
            ? {
                evento: eventoNome,
                linhas_na_planilha: plano.linhas.length,
                fornecedores_novos: c.fornecedoresCriar,
                fornecedores_a_atualizar: c.fornecedoresAtualizar,
                subgrupos_novos: c.subgruposCriar,
                supervisores_novos: c.supervisoresNovos,
                supervisores_que_ja_tem_acesso: c.supervisoresExistentes,
                supervisores_com_varios_setores: c.supervisoresMultiplos,
                linhas_com_erro_que_ficam_de_fora: c.linhasComErro,
              }
            : {
                evento: eventoNome,
                continuar_a_partir_da_linha: desde,
                linhas_que_faltam: aGravar.length,
                linhas_com_erro_que_ficam_de_fora: errosDaPrevia.length,
              }
          if (errosDaPrevia.length) {
            impacto.primeiros_erros = errosDaPrevia.slice(0, 10).map(e => `linha ${e.linha}: ${e.erro}`)
          }
          if (desde == null) {
            impacto.WhatsApp = 'cada supervisor novo recebe UM link de acesso, mesmo cuidando de vários setores'
          }
          return JSON.stringify(pedirConfirmacao(
            operacao,
            desde == null
              ? `Importar a estrutura da planilha no evento ${eventoNome}: ${aGravar.length} linha${aGravar.length !== 1 ? 's' : ''} válida${aGravar.length !== 1 ? 's' : ''}`
              : `Continuar a importação da estrutura no evento ${eventoNome}: faltam ${aGravar.length} linha${aGravar.length !== 1 ? 's' : ''}`,
            impacto,
            'o que será criado e atualizado, quantos supervisores ganham acesso, e quais linhas ficam de fora por erro (com o número da linha)',
            'criar'
          ))
        }

        // Gravação em levas sequenciais, como a tela faz. Cada leva relê o
        // banco, então o que a anterior criou já conta como "existe".
        const resultados: ResultadoLinhaEstrutura[] = []
        let feitas = 0
        let levaMaisLonga = 0
        while (feitas < aGravar.length) {
          // Para ANTES de começar uma leva que provavelmente não cabe: cortar
          // no meio seria pior, porque a rota morreria sem devolver resumo.
          if (feitas > 0 && Date.now() - inicio + levaMaisLonga > ORCAMENTO_MS) break
          const leva = aGravar.slice(feitas, feitas + LEVA)
          const t0 = Date.now()
          try {
            const res = await importarEstruturaLote(eventoId, linhas, leva)
            if (!res.ok) resultados.push(...leva.map(linha => ({ linha, acao: 'erro' as const, erro: res.error })))
            else resultados.push(...res.resultados)
          } catch (e) {
            console.error('importar_estrutura_evento: leva falhou', e)
            resultados.push(...leva.map(linha => ({
              linha, acao: 'erro' as const, erro: 'Falhou nesta leva — importe de novo; o que já entrou não duplica.',
            })))
          }
          levaMaisLonga = Math.max(levaMaisLonga, Date.now() - t0)
          feitas += leva.length
        }

        const faltam = aGravar.slice(feitas)
        const criados = resultados.filter(x => x.acao === 'criado').length
        const atualizados = resultados.filter(x => x.acao === 'atualizado').length
        const erros = [
          ...errosDaPrevia,
          ...resultados.filter(x => x.acao === 'erro').map(x => ({ linha: x.linha, erro: x.erro ?? 'Erro sem detalhe.' })),
        ].sort((a, b) => a.linha - b.linha)
        const avisos = resultados.filter(x => x.aviso).map(x => ({ linha: x.linha, aviso: x.aviso as string }))

        await registrarAuditoriaIA(perfil, 'importar_estrutura_evento', {
          evento_id: eventoId, evento: eventoNome, linhas_na_planilha: linhas.length,
          continuou_da_linha: desde, criados, atualizados, erros: erros.length,
          faltam: faltam.length, linhas_com_erro: erros.map(e => e.linha),
        })

        // Erros e avisos não trazem CPF nem telefone (são as mensagens das
        // regras), então podem ir pro modelo explicar linha a linha.
        return JSON.stringify({
          ok: true,
          evento: eventoNome,
          fornecedores_criados: criados,
          registros_atualizados: atualizados,
          linhas_com_erro: erros.length,
          erros: erros.slice(0, 30),
          avisos: avisos.slice(0, 15),
          ...(faltam.length
            ? {
                interrompida_pelo_tempo: true,
                linhas_que_faltam: faltam.length,
                continuar_da_linha: faltam[0],
                instrucao_para_a_ia:
                  `A importação parou pelo tempo. Diga quantas linhas entraram e quantas faltam, e que é seguro continuar (o que já entrou não duplica). Quando o usuário pedir, chame importar_estrutura_evento de novo com continuar_da_linha=${faltam[0]} — isso pede uma nova confirmação.`,
              }
            : {
                observacao:
                  'Cada supervisor novo recebe no WhatsApp UM link de acesso; quem cuida de vários setores vê todos ao entrar. ' +
                  (erros.length ? 'As linhas com erro ficaram de fora: corrigir na planilha e importar de novo é seguro — o que já entrou é atualizado, não duplicado.' : ''),
              }),
        })
      },
    }),
  ]
}
