/**
 * ⚠️ DADOS FALSOS PARA APRESENTAÇÃO — ARQUIVO TEMPORÁRIO ⚠️
 *
 * Existe só para o Painel não ficar vazio numa demonstração. Nada aqui vem do
 * banco e nada aqui é gravado nele.
 *
 * COMO TIRAR (nesta ordem):
 *   1. `APRESENTACAO = false` desliga tudo na hora, sem tocar em mais nada.
 *   2. Para remover de vez: apague este arquivo e os três blocos marcados com
 *      "APRESENTACAO" em app/admin/page.tsx.
 *
 * Duas travas de segurança, porque isto vai para o mesmo código que roda em
 * produção:
 *   - Só preenche o que está VAZIO. Havendo um registro real que seja, o dado
 *     real manda e o falso nem é gerado — ou seja, num evento de verdade isto
 *     nunca aparece.
 *   - Nada é escrito no banco. É tudo montado em memória, a cada render.
 */

export const APRESENTACAO = true

/** Nomes e funções de exemplo. Óbvios o bastante pra ninguém confundir com equipe real. */
const PESSOAS = [
  { nome: 'Ana Beatriz Ramos', cargo: 'Bar', empresa: 'Bloco do Bero' },
  { nome: 'Carlos Henrique Lima', cargo: 'Segurança', empresa: 'Bloco do Bero' },
  { nome: 'Daniela Prado', cargo: 'Caixa', empresa: 'Bloco do Bero' },
  { nome: 'Eduardo Nascimento', cargo: 'Bar', empresa: 'Bloco do Bero' },
  { nome: 'Fernanda Coutinho', cargo: 'Camarim', empresa: 'Bloco do Bero' },
  { nome: 'Gabriel Moreira', cargo: 'Portaria', empresa: 'Bloco do Bero' },
  { nome: 'Helena Duarte', cargo: 'Caixa', empresa: 'Bloco do Bero' },
  { nome: 'Igor Fontenele', cargo: 'Segurança', empresa: 'Bloco do Bero' },
  { nome: 'Juliana Bastos', cargo: 'Bar', empresa: 'Bloco do Bero' },
  { nome: 'Lucas Andrade', cargo: 'Produção', empresa: 'Bloco do Bero' },
  { nome: 'Marina Vasconcelos', cargo: 'Camarim', empresa: 'Bloco do Bero' },
  { nome: 'Nelson Ribeiro', cargo: 'Portaria', empresa: 'Bloco do Bero' },
  { nome: 'Olívia Tavares', cargo: 'Bar', empresa: 'Bloco do Bero' },
  { nome: 'Paulo Sérgio Matos', cargo: 'Segurança', empresa: 'Bloco do Bero' },
  { nome: 'Queila Marques', cargo: 'Caixa', empresa: 'Bloco do Bero' },
  { nome: 'Rafael Siqueira', cargo: 'Produção', empresa: 'Bloco do Bero' },
  { nome: 'Sabrina Lopes', cargo: 'Bar', empresa: 'Bloco do Bero' },
  { nome: 'Thiago Meneses', cargo: 'Portaria', empresa: 'Bloco do Bero' },
  { nome: 'Úrsula Campelo', cargo: 'Camarim', empresa: 'Bloco do Bero' },
  { nome: 'Vinícius Barreto', cargo: 'Segurança', empresa: 'Bloco do Bero' },
  { nome: 'Wanessa Figueiredo', cargo: 'Caixa', empresa: 'Bloco do Bero' },
  { nome: 'Yuri Salgado', cargo: 'Bar', empresa: 'Bloco do Bero' },
  { nome: 'Zilda Monteiro', cargo: 'Produção', empresa: 'Bloco do Bero' },
  { nome: 'Bruno Castro Alves', cargo: 'Portaria', empresa: 'Bloco do Bero' },
]

const SETORES = ['Bar', 'Segurança', 'Caixa', 'Portaria', 'Camarim', 'Produção']

/** Porte do evento de exemplo. Um evento de 2 pessoas não demonstra nada. */
export const EQUIPE_EXEMPLO = PESSOAS.length     // 24
const ENTRARAM = 19
const SAIRAM = 4

type Ponto = { hora: string; entrada: number; meio: number; fim: number }

/**
 * Sino em torno de um ponto da janela. `centro` e `largura` vão de 0 a 1, em
 * fração da janela — assim a curva acompanha o evento em vez de horas fixas do
 * relógio: num evento de 8h as três ondas ficam apertadas, num de 2 dias elas
 * se espalham, e nos dois casos o desenho continua fazendo sentido.
 */
function sino(pos: number, centro: number, largura: number, pico: number) {
  const d = (pos - centro) / largura
  return Math.round(pico * Math.exp(-(d * d) * 4))
}

/**
 * Preenche a janela recebida com três ondas: a equipe chega concentrada no
 * começo, o "meio" acontece no auge e a saída se espalha no fim.
 *
 * Recebe as casas já montadas pela página (com os rótulos certos) e só troca
 * os números — assim o eixo do exemplo é exatamente o eixo real, e trocar a
 * janela do evento não exige mexer aqui.
 */
export function fluxoDeExemplo(casas: Ponto[]): Ponto[] {
  const n = casas.length
  if (n < 2) return casas
  return casas.map((c, i) => {
    const pos = i / (n - 1)
    return {
      hora: c.hora,
      entrada: sino(pos, 0.18, 0.22, 32),
      meio: sino(pos, 0.52, 0.20, 29),
      fim: sino(pos, 0.85, 0.20, 27),
    }
  })
}

/** Mesma forma que a consulta de `ultimosRegistros` devolve. */
export function atividadeDeExemplo(agora: Date) {
  const etapas = ['entrada', 'meio', 'fim'] as const
  return PESSOAS.map((p, i) => ({
    id: `exemplo-${i}`,
    // Espaçadas de ~7 minutos, da mais recente para trás.
    created_at: new Date(agora.getTime() - i * 7 * 60 * 1000).toISOString(),
    tipo: etapas[i < 4 ? 1 : i < 8 ? 0 : 2],
    funcionarios: { nome: p.nome, cargo: p.cargo, empresa: p.empresa },
  }))
}

/**
 * Porte do evento na demonstração. Substitui equipe e presentes do evento
 * ativo — com os 2 funcionários de teste do banco, "1 de 2 presentes" não
 * demonstra nada.
 */
export function eventoDeExemplo() {
  return { equipe: EQUIPE_EXEMPLO, presentes: ENTRARAM - SAIRAM, setores: SETORES.length }
}

// ─── Tela de Atividades ──────────────────────────────────────────────────────

export type LinhaAtividade = {
  id: string
  nome: string
  cpf: string
  setor: string
  etapa: 'entrada' | 'meio' | 'fim'
  em: string
  assistido: boolean
  temFoto: boolean
  local: string | null
  registradoPor: string | null
  justificativa: string | null
}

const SUPERVISORES = ['Marcos Aurélio', 'Patrícia Nunes', 'Rodrigo Belmiro']
const LOCAIS = [
  'Av. Beira Mar, 1200 — Vitória/ES',
  'Portão B — Setor Norte',
  'Rua da Praia, 45 — Vitória/ES',
]

/** CPF de fachada, com máscara e sem parecer real. */
const cpfFalso = (i: number) =>
  `${String(100 + i).padStart(3, '0')}.${String(200 + i * 7).slice(0, 3)}.${String(300 + i * 3).slice(0, 3)}-0${i % 10}`

/**
 * Cenário completo de um evento em andamento: quem entrou, quem já saiu, quem
 * não chegou, e a linha do tempo das batidas.
 *
 * Tudo sai do MESMO conjunto de pessoas, então os números do topo, as duas
 * listas e a linha do tempo contam a mesma história. Gerar cada bloco por
 * conta própria daria uma tela que se contradiz — 19 presentes no cartão e 7
 * nomes na lista.
 */
export function cenarioDeExemplo(agora: Date) {
  const entraram = PESSOAS.slice(0, ENTRARAM)
  const sairam = entraram.slice(0, SAIRAM)
  const naoChegaram = PESSOAS.slice(ENTRARAM)

  const pessoa = (p: (typeof PESSOAS)[number], i: number) => ({
    id: `exemplo-${i}`,
    nome: p.nome,
    setor: p.cargo,
    telefone: `27 9${String(90000000 + i * 137).slice(0, 8)}`,
  })

  const linhas: LinhaAtividade[] = []
  let minutos = 4
  const push = (
    p: (typeof PESSOAS)[number],
    i: number,
    etapa: LinhaAtividade['etapa'],
    // Saída e entrada são lidas no QR pelo supervisor; o meio é selfie da
    // própria pessoa. Uma em cada oito entradas é registro assistido, que é
    // mais ou menos a proporção real de quem perde a janela.
    modo: 'qr' | 'foto' | 'assistido'
  ) => {
    linhas.push({
      id: `exemplo-reg-${linhas.length}`,
      nome: p.nome,
      cpf: cpfFalso(i),
      setor: p.cargo,
      etapa,
      em: new Date(agora.getTime() - minutos * 60 * 1000).toISOString(),
      assistido: modo === 'assistido',
      temFoto: modo !== 'qr',
      local: modo === 'qr' ? null : LOCAIS[i % LOCAIS.length],
      registradoPor: modo === 'foto' ? null : SUPERVISORES[i % SUPERVISORES.length],
      justificativa: modo === 'assistido' ? 'Perdeu a janela — sem bateria no celular' : null,
    })
    minutos += 3 + (i % 5)
  }

  // Da mais recente para a mais antiga: primeiro as saídas, depois os "meio",
  // e as entradas no fim — é a ordem em que um evento noturno acontece.
  sairam.forEach((p, i) => push(p, i, 'fim', 'qr'))
  entraram.slice(0, 9).forEach((p, i) => push(p, i, 'meio', 'foto'))
  entraram.forEach((p, i) => push(p, i, 'entrada', i % 8 === 3 ? 'assistido' : 'qr'))

  const hoje = agora.toDateString()
  return {
    linhas,
    naoChegaram: naoChegaram.map((p, i) => pessoa(p, ENTRARAM + i)),
    presentes: entraram.slice(SAIRAM).map((p, i) => pessoa(p, SAIRAM + i)),
    jaSairam: SAIRAM,
    totalEquipe: EQUIPE_EXEMPLO,
    batidasHoje: linhas.filter(l => new Date(l.em).toDateString() === hoje).length,
  }
}
