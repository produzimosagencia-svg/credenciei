// Reconhecimento facial — a parte pura, sem banco e sem câmera.
//
// ─── O QR CODE NUNCA É DESATIVADO ───────────────────────────────────────────
//
// Biometria é um SEGUNDO jeito de responder "quem é essa pessoa?" (identifi-
// cação), ao lado do QR — nunca no lugar dele. A autorização ("ela pode
// entrar agora?": evento certo, aprovada, ativa, não bloqueada, já entrou?)
// é uma função SÓ, em lib/actions.ts (`autorizarPresenca`), chamada pelos
// dois caminhos. Este arquivo não sabe nada sobre evento, funcionário ou
// banco — só compara números.
//
// ─── POR QUE EMBEDDING, NÃO PIXEL ───────────────────────────────────────────
//
// Comparar imagem por imagem (pixel a pixel) quebra com qualquer mudança de
// luz, ângulo ou expressão. O modelo (face-api.js, rede treinada por
// justadudewhohacks a partir da arquitetura do dlib/ResNet, MIT) resume um
// rosto em 128 números — o "embedding" — de um jeito em que rostos parecidos
// caem perto uns dos outros nesse espaço, e rostos diferentes caem longe.
// Comparar dois rostos vira medir a DISTÂNCIA entre dois pontos.
//
// ─── LIMIAR É DECISÃO DE NEGÓCIO, NÃO SÓ TÉCNICA ────────────────────────────
//
// Um limiar frouxo demais libera a pessoa errada — o pior resultado possível
// num sistema de credenciamento. Um limiar apertado demais manda gente
// legítima pro QR à toa. `LIMIAR_PADRAO` e `MARGEM_MINIMA` são o ponto de
// partida documentado pelo modelo (0.6 é o valor que o próprio face-api.js
// recomenda como "mesma pessoa"); calibrar com dados reais de um evento é
// trabalho de PoC, não desta função.

/** Tamanho do embedding que este sistema aceita. Mudar de modelo muda este número. */
export const TAMANHO_DESCRITOR = 128

/**
 * Distância abaixo da qual DOIS rostos são considerados a mesma pessoa.
 *
 * Documentada pelo próprio face-api.js como o limiar de referência para o
 * modelo `face_recognition_model` (distância euclidiana, não cosseno).
 * Mais baixo = mais rigoroso (menos risco de confundir duas pessoas, mais
 * risco de não reconhecer a pessoa certa por causa de luz/ângulo ruins).
 */
export const LIMIAR_PADRAO = 0.5

/**
 * A margem mínima entre o melhor e o segundo melhor candidato.
 *
 * Só o limiar não basta: numa galeria de centenas de pessoas, pode haver
 * dois rostos parecidos (irmãos, coincidência) os dois abaixo do limiar. Se a
 * diferença entre o 1º e o 2º colocado for pequena demais, é sinal de
 * ambiguidade — melhor recusar e mandar pro QR do que arriscar a pessoa
 * errada. Ver "5. Liveness / matching" do estudo em credenciei-biometria.
 */
export const MARGEM_MINIMA = 0.07

/** Quantidade mínima de pontos de referência (landmarks) — ver `qualidadeAceitavel`. */
export const CONFIANCA_MINIMA_DETECCAO = 0.5

/** Distância euclidiana entre dois vetores do mesmo tamanho. */
export function distanciaEuclidiana(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity
  let soma = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    soma += d * d
  }
  return Math.sqrt(soma)
}

/** O descritor tem o formato certo — 128 números finitos? Não confia em nada que veio do cliente. */
export function descritorValido(descritor: unknown): descritor is number[] {
  return Array.isArray(descritor)
    && descritor.length === TAMANHO_DESCRITOR
    && descritor.every(n => typeof n === 'number' && Number.isFinite(n))
}

export type Candidato = { funcionarioId: string; distancia: number }

export type ResultadoMatch =
  | { encontrado: true; funcionarioId: string; distancia: number }
  | { encontrado: false; motivo: 'sem_candidatos' | 'acima_do_limiar' | 'ambiguo' }

/**
 * Decide, entre TODOS os candidatos de UM evento, quem (se alguém) é a
 * pessoa do descritor recebido.
 *
 * Recebe já as distâncias calculadas (não os vetores) para ficar puro e
 * fácil de testar sem gerar embedding de verdade.
 *
 * Nunca revela o segundo colocado nem qualquer outro candidato — só
 * responde "achei" ou "não achei", e por quê (para log interno; a pessoa
 * nunca vê "quase achei fulano").
 */
export function decidirMatch(
  candidatos: Candidato[],
  limiar = LIMIAR_PADRAO,
  margemMinima = MARGEM_MINIMA,
): ResultadoMatch {
  if (!candidatos.length) return { encontrado: false, motivo: 'sem_candidatos' }

  const ordenados = [...candidatos].sort((a, b) => a.distancia - b.distancia)
  const melhor = ordenados[0]
  if (melhor.distancia > limiar) return { encontrado: false, motivo: 'acima_do_limiar' }

  const segundo = ordenados[1]
  if (segundo && (segundo.distancia - melhor.distancia) < margemMinima) {
    return { encontrado: false, motivo: 'ambiguo' }
  }

  return { encontrado: true, funcionarioId: melhor.funcionarioId, distancia: melhor.distancia }
}

/**
 * A pessoa mostrou EXATAMENTE UM rosto, de frente, sem estar longe demais?
 *
 * Detecção ≠ identificação ≠ liveness — três perguntas diferentes. Isto
 * responde só a primeira, antes de gastar tempo gerando o embedding: mais de
 * um rosto na cena é recusado aqui (não se compara "a pessoa mais central",
 * que abriria brecha pra flagrar quem está atrás por engano).
 */
export function deteccaoUtilizavel(deteccoes: { score: number }[]): { ok: true } | { ok: false; motivo: 'nenhum_rosto' | 'multiplos_rostos' | 'qualidade_baixa' } {
  if (!deteccoes.length) return { ok: false, motivo: 'nenhum_rosto' }
  if (deteccoes.length > 1) return { ok: false, motivo: 'multiplos_rostos' }
  if (deteccoes[0].score < CONFIANCA_MINIMA_DETECCAO) return { ok: false, motivo: 'qualidade_baixa' }
  return { ok: true }
}

export const MENSAGEM_POR_MOTIVO: Record<string, string> = {
  sem_candidatos: 'Ainda não há ninguém cadastrado com biometria neste evento.',
  acima_do_limiar: 'Não conseguimos identificar seu cadastro.',
  ambiguo: 'Não conseguimos identificar seu cadastro com segurança.',
  nenhum_rosto: 'Não encontramos um rosto na imagem.',
  multiplos_rostos: 'Mais de um rosto na câmera — só uma pessoa por vez.',
  qualidade_baixa: 'A imagem não ficou nítida o suficiente.',
}
