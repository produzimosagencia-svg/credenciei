/*
 * TODA AÇÃO QUE ALTERA DADOS GRAVA NA AUDITORIA (pedido do Juan, 08/10/2026: "tudo que acontece no sistema, de
 * todas as pessoas, precisa estar na auditoria"). Varre os arquivos 'use server': cada ação exportada que grava
 * (insert/update/delete/upsert) precisa chamar `registrarAuditoria` (ou o registro de cadastro), a não ser que
 * esteja na lista abaixo COM o motivo. Ação nova sem auditoria quebra este teste.
 *
 * Roda com: node testes/auditoria-cobertura.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const raiz = new URL('..', import.meta.url).pathname

/** Ações que gravam e NÃO precisam de linha na auditoria — sempre com o porquê. */
const SEM_AUDITORIA_DE_PROPOSITO = {
  registrarPresencaFoto: 'é a própria batida de ponto: fica em `registros`, com quem e quando (milhares por dia)',
  registrarPresencaLivre: 'idem — a batida é o registro',
  conferirCredenciamentoPorCpf: 'só consulta; grava apenas a leitura em `leituras_qr`',
  carregarTravasDoModal: 'só leitura',
  urlFotoVeiculo: 'só gera o endereço temporário da foto',
  trocarSetorAtivo: 'é a navegação do supervisor entre os setores dele (qual tela abrir), não muda dado de ninguém',
  entrarNoEventoSupervisor: 'idem — escolhe o evento que o supervisor está vendo',
  marcarAlertaLido: 'marca o alerta de monitoramento como lido na tela do master',
  marcarTodosAlertasLidos: 'idem',
  removerEncarregado: 'chama `salvarEncarregado`, que grava REMOCAO_ENCARREGADO',
  criarFornecedor: 'chama `criarFornecedorOuLanca`, que grava SETOR_CRIADO',
}

function arquivos(dir) {
  return readdirSync(dir).flatMap(n => {
    const c = join(dir, n)
    if (n === 'node_modules' || n.startsWith('.')) return []
    return statSync(c).isDirectory() ? arquivos(c) : (/\.tsx?$/.test(n) ? [c] : [])
  })
}

let falhas = 0
const faltando = []
let cobertas = 0
for (const f of [...arquivos(join(raiz, 'lib')), ...arquivos(join(raiz, 'app'))]) {
  const s = readFileSync(f, 'utf8')
  if (!s.trimStart().startsWith("'use server'")) continue
  const inicios = [...s.matchAll(/\nexport async function (\w+)/g)]
  inicios.forEach((m, i) => {
    const corpo = s.slice(m.index, inicios[i + 1]?.index ?? s.length)
    const escreve = /\.(insert|update|delete|upsert)\(/.test(corpo)
    if (!escreve) return
    if (/registrarAuditoria|registrarCadastro|registrarAuditoriaIA|\bauditar\(/.test(corpo)) { cobertas++; return }
    if (SEM_AUDITORIA_DE_PROPOSITO[m[1]]) return
    faltando.push(`${f.replace(raiz, '')}: ${m[1]}`)
  })
}
console.log(`Ações que gravam e registram na auditoria: ${cobertas}`)
if (faltando.length) {
  falhas++
  console.log(`  \x1b[31m✗ ${faltando.length} ação(ões) gravam sem auditoria:\x1b[0m`)
  for (const x of faltando) console.log(`     ${x}`)
} else {
  console.log('  \x1b[32m✓\x1b[0m nenhuma ação grava sem deixar rastro na auditoria')
}
process.exit(falhas ? 1 : 0)
