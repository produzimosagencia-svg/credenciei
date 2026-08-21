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
 * Sobre o TOM: quem recebe estas mensagens é o freelancer que vai trabalhar no
 * evento, no WhatsApp pessoal dele, muitas vezes de madrugada e com pressa.
 * Emoji aqui não é enfeite — é o que faz a mensagem ser lida em vez de
 * ignorada como aviso automático, e o que dá âncora visual pra achar a
 * informação (📍 é o local, 🕐 é o horário, 🔗 é o link) sem ler tudo.
 *
 * Emoji marca INFORMAÇÃO, não decora frase. Um por linha útil, sempre o mesmo
 * símbolo pro mesmo tipo de dado em todas as mensagens — senão vira ruído e
 * o efeito se perde.
 */

/** Ordem dos parâmetros = a mesma de `montarEnvioTemplate`. */
const MODELOS: Record<string, (p: string[]) => string> = {
  boas_vindas_funcionario: ([nome, evento, setor, data, local, link]) =>
`Oi, ${nome}! 🎉 Seu cadastro no *${evento}* está confirmado.

📋 Setor: ${setor}
📅 Data: ${data}
📍 Local: ${local}

🔗 Sua credencial:
${link}

⭐ Salve esse link nos favoritos — é ele que você vai usar o evento inteiro.

*Como funciona no dia:*

1️⃣ *CHEGADA* — procure seu supervisor e mostre o QR Code da credencial.
2️⃣ *DURANTE* — no horário indicado, abra o link e tire uma selfie, com a localização do celular ligada.
3️⃣ *SAÍDA* — na hora de ir, mostre o QR Code de novo.

⏰ Cada etapa só funciona dentro do horário marcado. Pode ficar tranquilo: a gente te avisa por aqui na hora de cada uma. 😉`,

  lembrete_credenciamento: ([nome, evento, instrucao, limite, link]) =>
`🔔 ${nome}, chegou a hora de registrar sua presença no *${evento}*!

✅ O que fazer agora: ${instrucao}.

⏰ Você tem até *${limite}* — depois desse horário o sistema não aceita mais.

🔗 Sua credencial:
${link}`,

  reforco_credenciamento: ([nome, evento, instrucao, limite, link]) =>
`⚠️ ${nome}, atenção! Sua presença no *${evento}* ainda não foi registrada.

✅ O que fazer: ${instrucao}.

⏳ O prazo encerra às *${limite}*. Depois disso não dá mais.

🔗 Sua credencial:
${link}

Corre lá! 🏃`,

  aviso_dia_evento: ([nome, evento, abre, fecha, link]) =>
`🎉 Bom dia, ${nome}! Hoje é dia de *${evento}*!

🕐 O credenciamento abre às *${abre}* e fecha às *${fecha}*.

📌 Chegue com folga e procure seu supervisor para registrar o QR Code da sua credencial.

Lembrando que durante o evento você também faz o registro por selfie 🤳, e mostra o QR Code de novo na saída 👋

🔗 Sua credencial:
${link}

Bom trabalho! 💪`,

  confirmacao_escala: ([nome, evento, funcao, setor, quando, instrucoes, link]) =>
`📋 Oi, ${nome}! Confirmando sua escala no *${evento}*.

👤 Função: ${funcao}
🏷️ Setor: ${setor}
📅 Quando: ${quando}

📌 ${instrucoes}

🔗 Sua credencial com o QR Code:
${link}

Qualquer impedimento, avise seu supervisor o quanto antes. 🙏`,

  alerta_supervisor_pendencia: ([nome, quantidade, setor, etapa, link]) =>
`🚨 ${nome}, atenção!

*${quantidade} pessoa(s)* do setor *${setor}* não registraram a etapa *${etapa}*.

🔗 Veja quem está pendente:
${link}`,

  /*
   * O supervisor recebe NOME DE USUÁRIO, não e-mail: é assim que ele entra.
   * O endereço interno do banco de autenticação nunca aparece pra ele.
   */
  credenciais_supervisor: ([nome, setor, evento, data, usuario, senha, login, formulario]) =>
`🔑 Olá, ${nome}! Você é o supervisor do setor *${setor}*, no evento *${evento}*, que acontece em *${data}*.

*Seu acesso ao sistema:*
👤 Usuário: *${usuario}*
🔒 Senha: *${senha}*
🔗 Entre em: ${login}

⚠️ Entre com o USUÁRIO acima, não com e-mail.

📲 Para sua equipe se cadastrar, mande este link no grupo do setor:
${formulario}

No sistema você acompanha quem já se cadastrou ✅, escaneia o QR Code na entrada e na saída 📷, e vê quem está com presença pendente ⏰

Bom evento! 🎉`,
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
