/**
 * Os textos das mensagens de WhatsApp.
 *
 * A Evolution manda TEXTO LIVRE; a Cloud API da Meta mandava TEMPLATE com
 * variáveis numeradas. Em vez de reescrever toda a montagem de dados, o
 * sistema continua produzindo `{ template, params }` — que é onde moram as
 * consultas e as regras — e este arquivo só transforma isso em texto.
 *
 * O ganho é reversibilidade: voltar pra Cloud API é trocar `lib/whatsapp.ts`
 * de novo, sem tocar em `montarEnvioTemplate`.
 *
 * Os textos são os mesmos que estavam aprovados na Meta (ver
 * supabase/TEMPLATES-WHATSAPP.md). Mantê-los idênticos importa: eles foram
 * escritos pra explicar as três etapas a quem nunca usou o sistema, e são a
 * única instrução que o funcionário recebe.
 */

/** Ordem dos parâmetros = a mesma de `montarEnvioTemplate`. */
const MODELOS: Record<string, (p: string[]) => string> = {
  boas_vindas_funcionario: ([nome, evento, setor, data, local, link]) =>
`Olá, ${nome}! Seu cadastro no evento ${evento} foi confirmado. ✅

Setor: ${setor}
Data: ${data}
Local: ${local}

Sua credencial está neste link — salve nos favoritos, é ela que você vai usar durante todo o evento:
${link}

Como funciona no dia, em 3 etapas:

1. ENTRADA — ao chegar, procure seu supervisor e mostre o QR Code da credencial.
2. DURANTE O EVENTO — no horário indicado na credencial, abra o link e tire uma selfie você mesmo, com a localização do celular ligada.
3. SAÍDA — na hora de ir embora, mostre o QR Code de novo para o supervisor.

Cada etapa só funciona dentro do horário marcado. Vamos te lembrar por aqui na hora de cada uma.`,

  lembrete_credenciamento: ([nome, evento, instrucao, limite, link]) =>
`Olá, ${nome}! Chegou a hora de registrar sua presença no evento ${evento}.

O que fazer agora: ${instrucao}.

Você tem até às ${limite} para registrar. Depois desse horário o sistema não aceita mais.

Sua credencial: ${link}`,

  reforco_credenciamento: ([nome, evento, instrucao, limite, link]) =>
`${nome}, atenção: sua presença no evento ${evento} ainda não foi registrada. ⏰

O que fazer: ${instrucao}.

O prazo encerra às ${limite}. Depois disso não dá mais para registrar.

Sua credencial: ${link}`,

  aviso_dia_evento: ([nome, evento, abre, fecha, link]) =>
`Bom dia, ${nome}! Hoje é o dia do evento ${evento}. 🎉

O credenciamento abre às ${abre} e fecha às ${fecha}. Chegue com folga e procure seu supervisor para registrar o QR Code da sua credencial.

Não esqueça que durante o evento você também precisa fazer o registro por selfie, e mostrar o QR Code de novo na saída.

Sua credencial: ${link}`,

  confirmacao_escala: ([nome, evento, funcao, setor, quando, instrucoes, link]) =>
`Olá, ${nome}! Confirmando sua escala no evento ${evento}.

Função: ${funcao}
Setor: ${setor}
Quando: ${quando}

${instrucoes}

Sua credencial com o QR Code: ${link}

Qualquer impedimento, avise seu supervisor o quanto antes.`,

  alerta_supervisor_pendencia: ([nome, quantidade, setor, etapa, link]) =>
`${nome}, atenção: ${quantidade} pessoa(s) do setor ${setor} não registraram a etapa ${etapa}.

Veja quem está pendente no painel: ${link}`,

  credenciais_supervisor: ([nome, setor, evento, data, email, senha, login, formulario]) =>
`Olá, ${nome}! Você foi cadastrado como supervisor do setor ${setor}, no evento ${evento}, que acontece em ${data}.

Seu acesso ao sistema:
E-mail: ${email}
Senha: ${senha}
Entre em: ${login}

Para a sua equipe se cadastrar, compartilhe este link no grupo do setor: ${formulario}

No sistema você acompanha quem já se cadastrou, escaneia o QR Code na entrada e na saída, e vê quem está com presença pendente.`,
}

/**
 * Texto final da mensagem. Devolve `null` quando o modelo não existe — o
 * chamador cancela o envio em vez de mandar algo pela metade.
 */
export function renderizarMensagem(template: string, params: string[]): string | null {
  const modelo = MODELOS[template]
  if (!modelo) return null
  const texto = modelo(params.map(p => (p ?? '').toString())).trim()
  return texto || null
}
