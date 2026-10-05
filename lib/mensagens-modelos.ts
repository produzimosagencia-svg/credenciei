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
  /*
   * `comoFunciona` chega pronto de `instrucoesDeAcesso` (lib/mensagens.ts) —
   * é o único trecho que muda entre QR e biometria, e a decisão de qual
   * texto usar mora lá, não aqui. Este arquivo só interpola.
   */
  boas_vindas_funcionario: ([nome, evento, setor, data, local, link, comoFunciona]) =>
`Oi, ${nome}! 🎉 Seu cadastro no *${evento}* está confirmado.

📋 Fornecedor: ${setor}
📅 Data: ${data}
📍 Local: ${local}

🔗 Sua credencial:
${link}

⭐ Salve esse link nos favoritos — é ele que você vai usar o evento inteiro.

${comoFunciona}

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
  /*
   * `descricaoEntrada`/`descricaoSaida` chegam prontas de `instrucoesDeAcesso`
   * (lib/mensagens.ts) — só a frase de COMO acessar muda com o método do
   * evento; os avisos ⚠️ abaixo são genéricos e continuam fixos aqui.
   */
  aviso_dia_evento: ([nome, evento, local, abre, fecha, meio, saidaAbre, saidaFecha, link, descricaoEntrada, descricaoSaida]) =>
`🎉 *HOJE É O GRANDE DIA!*

${nome}, hoje é o *${evento}*. Segue tudo o que você precisa saber 👇

📍 Local: ${local}

━━━━━━━━━━━━━━━━━━

*1️⃣ ENTRADA — das ${abre} às ${fecha}*

${descricaoEntrada}

⚠️ Chegue com folga: fora desse horário o sistema não aceita, e aí só o responsável consegue liberar.

*2️⃣ MEIO — às ${meio}*

Você mesmo faz, pelo celular: abra sua credencial, toque no cartão do meio e tire uma selfie com a *localização ligada*.

⚠️ Não esqueça — é isso que comprova suas horas no meio do turno.

*3️⃣ SAÍDA — das ${saidaAbre} às ${saidaFecha}*

${descricaoSaida}

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
🤳 Durante o turno avisamos por aqui a hora de abrir a credencial e tirar a selfie do meio.

⚠️ Não esqueça de registrar — é assim que suas horas ficam comprovadas.

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
🤳 Durante o turno avisamos por aqui a hora de abrir a credencial e tirar a selfie do meio.

⚠️ Não esqueça de registrar a saída no fim — é ela que fecha o seu dia e comprova as horas trabalhadas.

🔗 Sua credencial:
${link}

Obrigado pelo trabalho! 🙏`,

  /*
   * ORDEM DOS PARÂMETROS — não é arbitrária, é a posição exata que a Meta
   * espera (conferido direto na API, 30/09/2026 — o texto aprovado de
   * verdade tinha só 7 variáveis, nem de perto o que o código antigo aqui
   * supunha; ver `meta-verificar-direto-na-api` na memória do projeto:
   * nunca confiar no código/comentário sobre o que está realmente aprovado).
   *
   * `avisoUniforme` é a 8ª variável, ACRESCENTADA ao template (Vital, item
   * 4, 30/09/2026). `rotuloCredencial` fica por ÚLTIMO (9º) de propósito —
   * ele só existe pro texto local (Evolution/log), NUNCA vai pro corpo
   * aprovado na Meta (`QTD_VARIAVEIS_BODY.confirmacao_escala = 8` em
   * lib/whatsapp-meta.ts corta exatamente nesse ponto). Mudar a ORDEM aqui
   * sem mudar `montarEnvioTemplate` (lib/mensagens.ts) troca os valores de
   * lugar silenciosamente no WhatsApp de verdade.
   */
  confirmacao_escala: ([nome, evento, funcao, setor, quando, instrucoes, link, avisoUniforme, rotuloCredencial]) =>
`📋 Oi, ${nome}! Confirmando sua escala no *${evento}*.

👤 Função: ${funcao}
🏷️ Fornecedor: ${setor}
📅 Quando: ${quando}

📌 ${instrucoes}

👕 ${avisoUniforme}

🔗 ${rotuloCredencial}
${link}

Qualquer impedimento, avise seu supervisor o quanto antes. 🙏`,

  /*
   * Template irmão de `confirmacao_escala`, só pra evento com subeventos —
   * mesma estrutura, acrescentando evento pai/subevento/setor na abertura
   * (pedido do Juan, 05/10/2026). `setor` e `fornecedor` chegam com o MESMO
   * valor (nome do fornecedor) — ver o comentário em `montarEnvioTemplate`
   * (lib/mensagens.ts) sobre por que são dois parâmetros e não um reusado.
   */
  confirmacao_subeventos: ([nome, eventoPai, subevento, setor, funcao, fornecedor, quando, instrucoes, link, avisoUniforme, rotuloCredencial]) =>
`📋 Oi, ${nome}! Você foi escalado(a) para trabalhar no evento *${eventoPai}*, no subevento *${subevento}*, no setor *${setor}*.

👤 Função: ${funcao}
🏷️ Fornecedor: ${fornecedor}
📅 Quando: ${quando}

📌 ${instrucoes}

👕 ${avisoUniforme}

🔗 ${rotuloCredencial}
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

*${quantidade} pessoa(s)* do fornecedor *${setor}*: ${etapa}.
📅 Evento: ${evento}

Quem está pendente:
${lista}

🔗 Lista completa e detalhes:
${link}

Vale conferir antes de encerrar a etapa. 🙏`,

  /*
   * Mesmo texto do template aprovado na Meta (`alerta_supervisor_credenciamento`,
   * definido pelo sócio do Juan) — só o botão de URL vira link inline, texto
   * livre não tem botão. `link` é o 5º item de `params`; os 4 primeiros
   * (nome, prazo, evento, quantidade) são os que também vão no corpo de
   * verdade na Cloud API — ver `QTD_VARIAVEIS_BODY` em lib/whatsapp-meta.ts.
   */
  alerta_supervisor_credenciamento: ([nome, prazo, evento, quantidade, link]) =>
`Olá, ${nome}! ⏰

Faltam ${prazo} para o evento ${evento}. Na sua equipe, o credenciamento ainda está pendente para: ${quantidade}.

Quanto antes for concluído, mais tranquila fica a entrada no dia. Veja quem falta:
${link}`,

  /*
   * O supervisor recebe NOME DE USUÁRIO, não e-mail: é assim que ele entra.
   * O endereço interno do banco de autenticação nunca aparece pra ele.
   */
  credenciais_supervisor: ([nome, setor, evento, data, usuario, senha, login, formulario]) =>
`🔑 Olá, ${nome}! Você é o supervisor do fornecedor *${setor}*, no evento *${evento}*, que acontece em *${data}*.

*Seu acesso ao sistema:*
👤 Usuário: *${usuario}*
🔒 Senha: *${senha}*
🔗 Entre em: ${login}

⚠️ Entre com o USUÁRIO acima, não com e-mail.

📲 Para sua equipe se cadastrar, mande este link no grupo do fornecedor:
${formulario}

No sistema você acompanha quem já se cadastrou ✅, escaneia o QR Code na entrada e na saída 📷, e vê quem está com presença pendente ⏰

Bom evento! 🎉`,

  /*
   * Cópia fiel do texto aprovado na Meta, inclusive sem o negrito que a versão
   * anterior tinha. Divergir aqui faria a prévia mostrar uma coisa e o
   * WhatsApp entregar outra — e prévia que mente é pior que não ter prévia.
   */
  cadastro_supervisor_cpf_link: ([nome, setor, evento, cpf, link]) =>
`Olá, ${nome}. Sua participação como supervisor do setor ${setor} no evento ${evento} foi confirmada.

Use seu CPF no link abaixo (${cpf})

Consulte as orientações e os próximos passos neste endereço individual:
${link}

Este endereço é pessoal. Se você não reconhece esta confirmação, ignore a mensagem.`,

  /*
   * Mesmo texto aprovado na Meta (template `veiculo_cadastrado`) — só o
   * botão de URL não existe em texto livre, então vira link inline. `link`
   * é o 3º item de `params`; os 2 primeiros (nome, evento) são os únicos que
   * também vão no corpo de verdade quando sai pela Cloud API — ver
   * `QTD_VARIAVEIS_BODY` em lib/whatsapp-meta.ts.
   */
  veiculo_cadastrado: ([nome, evento, link]) =>
`Olá, ${nome}! Tudo bem? 👋

Aqui é a equipe do Credenciei. O cadastro do seu veículo 🚗 para o evento ${evento} foi concluído ✅

Toque no link abaixo para ver as instruções de acesso. Guarde esta mensagem: você vai precisar delas no dia do evento.

${link}`,

  /**
   * Mesmo texto aprovado na Meta (template `credenciamento_negado`,
   * ativado em 28/09/2026 — ver o comentário em lib/mensagens.ts sobre o
   * template já existir e nunca ter sido ligado). Sem botão: uma negativa
   * não tem QR nem link pra mostrar.
   */
  credenciamento_negado: ([nome, evento, motivo, supervisor]) =>
`Olá, ${nome}! ⚠️

Seu credenciamento para o evento ${evento} não foi aprovado.

Motivo: ${motivo}.

Procure o seu supervisor ${supervisor} para resolver antes do evento.`,

  supervisor_escalado_evento: ([nome, evento, setor, data, local, login, formulario]) =>
`Olá, ${nome}. Sua designação como supervisor foi atualizada.

Evento: *${evento}*
Fornecedor: ${setor}
Data: ${data}
Local: ${local}

Consulte os detalhes da operação no sistema: ${login}

Cadastro da equipe: ${formulario}

Até lá.`,
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
