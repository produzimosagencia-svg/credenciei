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

1️⃣ *CHEGADA* — vá ao credenciamento e mostre o QR Code da credencial.
2️⃣ *4 HORAS DEPOIS* — abra o link e tire uma selfie, com a localização do celular ligada.
3️⃣ *SAÍDA* — na hora de ir, volte ao credenciamento e mostre o QR Code de novo.

🔄 Se você trabalha mais de um dia, cada dia tem o seu próprio ciclo — amanhã começa tudo de novo.

🔐 O QR Code muda todo dia: o de hoje não vale amanhã. Mostre sempre a tela ao vivo, nunca um print.

⏰ Pode ficar tranquilo: a gente te avisa por aqui na hora de cada etapa. 😉`,

  lembrete_credenciamento: ([nome, evento, instrucao, limite, link]) =>
`🔔 ${nome}, chegou a hora de registrar sua presença no *${evento}*!

✅ O que fazer agora: ${instrucao}.

⏰ Você tem até *${limite}* — depois desse horário o sistema não aceita mais.

🔗 Sua credencial:
${link}

Bom trabalho! 💪`,

  reforco_credenciamento: ([nome, evento, instrucao, limite, link]) =>
`⚠️ ${nome}, atenção! Sua presença no *${evento}* ainda não foi registrada.

✅ O que fazer: ${instrucao}.

⏳ O prazo encerra às *${limite}*. Depois disso não dá mais.

🔗 Sua credencial:
${link}

Corre lá! 🏃`,

  /*
   * O DIA DO EVENTO. É o único que recebe explicação completa.
   *
   * Nos dias de montagem a equipe já está no ritmo e um aviso curto basta.
   * No dia do evento tem portaria, fila, horário combinado com o cliente e
   * gente que só aparece nesse dia — quem erra aqui erra na frente de todo
   * mundo. Por isso as três etapas vêm escritas, com horário e o que fazer.
   */
  aviso_dia_evento: ([nome, evento, local, abre, fecha, meio, saidaAbre, saidaFecha, link]) =>
`🎉 *HOJE É O GRANDE DIA!*

${nome}, hoje é o *${evento}*. Segue tudo o que você precisa saber 👇

📍 Local: ${local}

━━━━━━━━━━━━━━━━━━

*1️⃣ ENTRADA — das ${abre} às ${fecha}*

Vá ao *credenciamento* e mostre o QR Code da sua credencial. É ele que registra sua entrada oficial no evento.

⚠️ Chegue com folga: fora desse horário o sistema não aceita, e aí só o responsável consegue liberar.

*2️⃣ MEIO — às ${meio}*

Você mesmo faz, pelo celular: abra sua credencial, toque no cartão do meio e tire uma selfie com a *localização ligada*.

⚠️ Sem o meio registrado, a saída não libera.

*3️⃣ SAÍDA — das ${saidaAbre} às ${saidaFecha}*

Volte ao credenciamento e mostre o QR Code de novo. É isso que fecha o seu dia e libera o seu pagamento.

━━━━━━━━━━━━━━━━━━

🔗 *Sua credencial:*
${link}

🔐 Ela é pessoal — o credenciamento confere seu nome na leitura.

Qualquer problema, procure o responsável pelo credenciamento. Bom evento! 💪`,

  /*
   * MONTAGEM — os dias antes do evento.
   *
   * Curto de propósito: quem trabalha na montagem já sabe o que vai fazer, e
   * um textão diário vira ruído que ninguém lê (e volume de texto repetido é
   * o que faz o número ser marcado como robô). Formal e explícito, sem
   * explicar de novo o que já foi explicado no cadastro.
   */
  aviso_montagem: ([nome, evento, local, link]) =>
`🔧 Bom dia, ${nome}!

Hoje é dia de *desenvolvimento* do *${evento}* — montagem e preparação da operação.

📍 Local: ${local}

⏰ Hoje o horário é livre: registre a *entrada* quando começar e a *saída* quando terminar.
🤳 *4 horas depois da sua entrada*, abra a credencial e tire a selfie do meio.

⚠️ A saída só libera depois que o meio estiver registrado — é assim que suas horas ficam comprovadas.

🔗 Sua credencial:
${link}

Bom trabalho! 💪`,

  /*
   * DESMONTAGEM — os dias depois do evento. Mesma estrutura da montagem, tom
   * diferente: a operação inverte e o pessoal precisa saber que é a última
   * etapa, não mais um dia igual aos outros.
   */
  aviso_desmontagem: ([nome, evento, local, link]) =>
`📦 Bom dia, ${nome}!

Hoje é dia de *desmontagem* do *${evento}*. A estrutura sai e a operação encerra.

📍 Local: ${local}

⏰ Horário livre: registre a *entrada* quando começar e a *saída* quando terminar.
🤳 *4 horas depois da sua entrada*, abra a credencial e tire a selfie do meio.

⚠️ Não esqueça de registrar a saída no fim — é ela que fecha o seu dia e comprova as horas trabalhadas.

🔗 Sua credencial:
${link}

Obrigado pelo trabalho! 🙏`,

  confirmacao_escala: ([nome, evento, funcao, setor, quando, instrucoes, link]) =>
`📋 Oi, ${nome}! Confirmando sua escala no *${evento}*.

👤 Função: ${funcao}
🏷️ Setor: ${setor}
📅 Quando: ${quando}

📌 ${instrucoes}

🔗 Sua credencial com o QR Code:
${link}

Qualquer impedimento, avise seu supervisor o quanto antes. 🙏`,

  /*
   * A lista vem pronta de `montarEnvioTemplate`, uma pessoa por linha.
   *
   * O supervisor le isso no meio da operacao, quase sempre em pe e com pressa.
   * So a contagem ("5 pessoas") o obriga a largar o que esta fazendo e abrir o
   * sistema pra descobrir quem sao — os nomes no corpo da mensagem deixam ele
   * ja sair atras das pessoas, e o link fica para conferir o resto.
   */
  alerta_supervisor_pendencia: ([nome, quantidade, setor, etapa, evento, lista, link]) =>
`🚨 ${nome}, atenção!

*${quantidade} pessoa(s)* do setor *${setor}*: ${etapa}.
📅 Evento: ${evento}

Quem está pendente:
${lista}

🔗 Lista completa e detalhes:
${link}

Vale conferir antes de encerrar a etapa. 🙏`,

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
