/**
 * Base de conhecimento do Credenciei — é o que a IA sabe sobre o sistema.
 *
 * Fica separada do prompt de comportamento de propósito: este texto é longo e
 * ESTÁVEL, então entra no cache de prompt da Anthropic (o mesmo conteúdo byte a
 * byte é cobrado a ~10% nas chamadas seguintes). Qualquer coisa que mude a cada
 * mensagem — nome do usuário, data, tela atual — vai depois, nunca aqui dentro,
 * senão o cache é invalidado a cada pergunta.
 *
 * Quando uma tela ou regra mudar, atualize aqui. É a fonte que a IA usa pra
 * responder "como faço X" — se estiver desatualizada, ela ensina errado.
 */
export const CONHECIMENTO_DO_SISTEMA = `
# O que é o Credenciei

Sistema de credenciamento e controle de presença para eventos. O organizador
cadastra um evento, divide em setores, cada setor tem um supervisor e uma
equipe. No dia, cada pessoa registra presença em três momentos e o organizador
acompanha tudo em tempo real.

# Papéis e o que cada um enxerga

- **master**: dono da plataforma. Vê todas as organizações. Cria organizações e
  os admins delas. Não pertence a nenhuma organização (organizacao_id nulo).
- **admin**: dono de UMA organização. Vê apenas os dados dela. Cria eventos (até
  o limite contratado), setores e supervisores. NÃO pode excluir eventos.
- **supervisor**: preso a UM setor (fornecedor). Vê só a equipe daquele setor e
  as presenças dela. NÃO tem mais o scanner (saiu do papel dele a pedido —
  quem credencia é o posto de credenciamento). Nunca vê outros setores,
  eventos ou a organização.
- **operador_portao**: preso à ORGANIZAÇÃO inteira (não a um setor). Só lê QR
  e registra ponto manual em "Registrar ponto" (/admin/localizar) — sem
  NENHUM acesso de gerenciamento (não edita evento, equipe, valores nem
  usuários). Existe pra quem opera fisicamente o credenciamento sem precisar
  de senha de admin.
- **funcionário**: não faz login. Usa dois links públicos — o formulário de
  cadastro e a credencial com o QR Code.

Papéis legados que ainda existem no banco mas não são mais oferecidos:
'gerente' (equivale a admin) e 'cliente'.

# As três etapas de presença

Todo evento tem três momentos, nesta ordem:

1. **entrada** — credenciamento na chegada. O posto de credenciamento lê o QR
   Code da pessoa. NÃO diga que é "o supervisor" que credencia: quem lê o QR
   pode ser o supervisor, a portaria ou outra pessoa da produção, e mandar o
   funcionário procurar o supervisor faz ele ir ao lugar errado.
2. **meio** — durante o turno. A PRÓPRIA pessoa abre a credencial no celular e
   tira uma selfie; o sistema grava foto e localização. Não tem QR aqui.
3. **fim** — saída (descredenciamento). De novo o QR Code no credenciamento.

# Horários — a regra que mais gera dúvida

## Entrada e saída são LIVRES
Em qualquer dia do PERÍODO do evento (data_inicio até data_fim), entrada e saída
podem ser registradas a qualquer hora. Não existe mais "perdeu a janela da
entrada". Fora do período, aí sim recusa.

## A exceção é o DIA PRINCIPAL
O dia principal é a data de início do evento. Só nele as janelas configuradas
(janela_entrada_inicio/fim e janela_fim_inicio/fim) continuam valendo como
trava, porque é o dia que tem portaria e horário combinado com o cliente.

## O meio é individual: entrada + 4 horas
O meio NÃO tem horário fixo e não usa mais janela_meio_*. Ele abre 4 horas
depois da hora em que A PESSOA bateu a entrada, e fica aberto por 2 horas. Quem
entrou 08:00 faz das 12:00 às 14:00; quem entrou 10:30 faz das 14:30 às 16:30.
Duas pessoas do mesmo setor têm meios diferentes se entraram em horas
diferentes — isso é o esperado, não um bug.
Sem entrada registrada, o meio nem abre: a recusa diz pra bater a entrada antes.

## Uma janela por pessoa POR DIA
Cada dia tem seu próprio ciclo. Quem trabalha hoje e amanhã bate entrada/meio/
saída nos dois dias, e o registro de um dia não apaga o do outro (é o campo
"data_ref" que separa). Segunda leitura do mesmo QR no mesmo dia NÃO regrava:
responde "já registrada às HH:MM". Isso é de propósito — reescrever a entrada
moveria junto o horário do meio.

## O QR Code muda sozinho
O QR carrega um código ASSINADO com prazo de 5 minutos, renovado pela própria
tela. Print antigo não funciona: o scanner recusa com "QR Code expirado". Se
alguém reclamar disso, a resposta é abrir a credencial ao vivo — ou o supervisor
usar o registro assistido.

## Jornadas recorrentes viraram EXPECTATIVA
Os horários da jornada ("jornada_dias") não travam mais nada. Eles dizem "que
horas era pra essa pessoa ter chegado" e alimentam as listas de pendência e os
lembretes de WhatsApp.

Quando alguém perde qualquer etapa, quem resolve é o supervisor (ou o
operador de portão) pela tela "Registrar ponto" (/admin/localizar, registro
assistido) — essa tela NÃO valida horário, justamente porque existe pra
quando o prazo já passou. Pede foto do rosto da pessoa, geolocalização
(quando disponível) e grava autor, aparelho e justificativa.

## A saída NÃO exige mais o meio
Registrar a saída não depende de o meio ter sido feito. Se sair sem meio, o
sistema grava sozinho a observação "Saída registrada sem registro de meio."
no registro de saída — aparece no histórico pra auditoria, mas não bloqueia
ninguém.

## batida_livre × checkin_autonomo — são coisas DIFERENTES
Fácil confundir os dois, mas resolvem perguntas diferentes:

- **batida_livre** (por evento): decide QUANDO a entrada/saída do DIA
  PRINCIPAL é aceita. Desligado (padrão): só dentro da janela configurada.
  Ligado: qualquer hora, sem trava — pra show com escala rotativa, onde a
  equipe entra a noite toda. Os horários configurados continuam valendo como
  REFERÊNCIA nas mensagens e no cálculo de atraso; só a recusa some.
- **checkin_autonomo** (por evento): decide QUEM pode fazer o registro do
  DIA PRINCIPAL. Desligado (padrão): só um operador, lendo o crachá (Fluxo
  1) — nada muda. Ligado: a própria pessoa TAMBÉM pode registrar sozinha
  (Fluxo 2, ver abaixo), em paralelo — nenhum caminho substitui o outro.

Nos dias de MONTAGEM/DESMONTAGEM, checkin_autonomo nunca entra em jogo:
lá o auto-atendimento já é sempre permitido, porque não existe operador de
plantão o tempo todo nesses dias.

## Fluxo 1 × Fluxo 2 — os dois caminhos de credenciar
- **Fluxo 1 (crachá)**: um operador (master/admin/gerente/cliente ou
  operador_portao) escaneia o QR pessoal da credencial de cada funcionário,
  em /scan. É o padrão do dia principal, e continua existindo sempre, em
  qualquer configuração.
- **Fluxo 2 (auto-atendimento)**: a própria pessoa se registra, sem
  operador. Dois pontos de entrada:
  - **QR fixo da portaria** (cartaz impresso, em /admin/eventos/[id]/portaria):
    um único QR por evento (token_portaria), pra quem chega sem estar
    credenciado ainda OU pra quem já é credenciado mas quer bater ponto sem
    fila. Ao escanear, pede o CPF: já credenciado NESTE evento → vai direto
    pro check-in; não achou → cai no cadastro público (formulário), que
    também pré-preenche os dados se a pessoa já trabalhou pra esta
    organização antes.
  - **Botão na própria credencial** (/credential/[token]): "Registrar
    entrada"/"Registrar saída", com localização, sem selfie (só o meio pede
    foto). Sempre disponível fora do dia principal; no dia principal, só
    quando checkin_autonomo está ligado nesse evento.

Ligar portaria_ativa NÃO liga checkin_autonomo, e vice-versa — são
interruptores independentes, um controla o cadastro de gente nova, o outro
controla quem pode registrar ponto sozinho no dia principal.

# Telas do sistema

## Início (/admin) — dashboard
Atalhos, números do momento (eventos, setores, funcionários, entradas hoje),
gráficos de presença por evento e por etapa, e feed de atividade recente.

## Eventos (/admin/eventos)
Lista de eventos ativos e encerrados. Mostra as licenças contratadas e quantas
foram usadas. Ao bater o limite, o admin não cria mais até o master aumentar.

## Encontre colaborador (/admin/encontrar) — SÓ MASTER
A base regional da plataforma, e um serviço vendido à parte: a organização que
não consegue fechar a própria equipe contrata, e o master atribui gente da base
ao evento dela. Nenhum admin enxerga esta tela — aberta a eles, entregaria a
equipe de um cliente ao concorrente.
Lista só quem AUTORIZOU aparecer (caixa de aceite no formulário público),
ordenado por quem tem mais presença registrada. Busca por nome, CPF e cidade.
O contato sai pelo WhatsApp do próprio master; o sistema não manda convite
automático, porque convite não é template aprovado pela Meta.

## Ficha da pessoa (/admin/pessoas/[cpf]) — SÓ MASTER
Histórico de uma pessoa pelo CPF: eventos em que trabalhou, organizações, taxa
de presença e último trabalho. NÃO mostra valores — o que uma organização pagou
é preço de concorrente. Tem também "Atribuir a um evento": escolhe evento e
setor, e a pessoa entra na equipe daquele cliente com os dados do cadastro mais
recente dela.

## Novo evento (/admin/eventos/novo)
Campos: nome*, descrição, data de início*, data de fim*, local, e as três
janelas de presença. As datas do evento são referência geral — quem controla o
ponto são as janelas.

## Detalhe do evento (/admin/eventos/[id])
Números do evento, progresso por etapa, lista de setores e atividade ao vivo.
Botões: Editar Evento, Escanear QR, Planilha (Google Sheets).
Cada setor tem "Importar planilha", que cadastra a equipe toda de uma vez a
partir de um .xlsx/.csv com as colunas Nome, CPF, Telefone, Empresa/Setor,
Cargo, Cidade, Chave PIX e Valor (só Nome e CPF são obrigatórios na planilha).
São os MESMOS campos do formulário público — planilha, formulário e cadastro
pela IA pedem o mesmo conjunto, pra ninguém entrar na base pela metade.
Também tem: o card do cartaz da portaria (liga/desliga portaria_ativa, troca
o token, link pro cartaz pra imprimir) e o card de operadores de portão
(cria e edita quem tem esse papel, mostrando o link de criar senha — não
manda WhatsApp automático pra este papel).

## Cartaz da portaria (/admin/eventos/[id]/portaria)
Folha A4 pra imprimir e colar na entrada: um QR fixo por evento
(token_portaria). Instrui "aponte a câmera, digite o CPF" — atende os dois
casos, gente nova (cai no cadastro) e gente já credenciada (vai direto pro
check-in). Só master/admin.

## Cadastrar equipe pela planilha, aqui no chat
A pessoa também pode anexar a planilha nesta conversa, pelo clipe ao lado do
campo de mensagem. Quando isso acontece você recebe um resumo (quantas linhas,
quais cargos) e cadastra tudo com a ferramenta importar_planilha — uma chamada
só, nunca linha por linha. Você não vê CPF nem nome de ninguém: quem lê o
arquivo é o sistema, justamente pra nenhum número passar por você e voltar
trocado. Pergunte em qual setor a equipe entra antes de importar.

## Editar evento (/admin/eventos/[id]/editar)
Mesmos campos do cadastro, mais a mensagem pré-evento de WhatsApp (quando
enviar + instruções livres que entram na confirmação de escala). Tem os dois
interruptores do dia principal: "Batida livre" (solta o HORÁRIO) e
"Auto-atendimento no dia principal" (solta QUEM registra — ver a seção
batida_livre × checkin_autonomo, acima). Os dois são independentes.

## Painel do setor (/admin/eventos/[id]/fornecedor/[fid])
É a tela do supervisor. Link de cadastro pra mandar no grupo, cadastro manual,
scanner, localizar funcionário, números da equipe e a tabela com o status de
cada etapa (verde = registrou, amarelo = janela aberta, vermelho = perdeu).

## Pendências (/admin/eventos/[id]/pendencias)
Quem ficou faltando em cada etapa, num dia escolhido: quem estava previsto e não
credenciou a entrada, quem entrou e não fez o meio, quem entrou e não
descredenciou. Traz nome, CPF, setor, horário esperado e a hora da entrada.
É a MESMA lista que o supervisor recebe no WhatsApp — sai da mesma função. O
supervisor vê só o próprio setor; admin vê o evento inteiro da organização.

## Usuários (/admin/usuarios) e Novo usuário (/admin/usuarios/novo)
Quem tem acesso ao sistema. Não confunde com a equipe do evento: quem só
trabalha no dia aparece dentro do setor, não aqui. Ao criar um supervisor, ele
recebe login e senha por WhatsApp e fica preso a um único setor.

## Escanear QR (/scan)
Leitor de QR. O botão Entrada/Saída decide o que é gravado — esquecer de trocar
grava na etapa errada.

## Localizar funcionário (/admin/localizar)
Registro assistido. Busca por CPF **ou por nome** — nome costuma achar várias
pessoas, então a tela lista os resultados (nome, CPF, cargo, setor e evento) pro
supervisor escolher quem está na frente dele. Depois mostra a ficha, exige foto
do rosto tirada na hora e grava sozinho a etapa pendente. O supervisor nunca
escolhe qual etapa. Grava auditoria: autor, horário, GPS, aparelho e
justificativa.

## Organizações (/admin/organizacoes) — só master
Clientes da plataforma. Foto de perfil, documento, responsável, limite de
eventos e valor cobrado (diário/semanal/mensal/por evento).

# Mensagens de WhatsApp

Todas usam template aprovado na Meta (Cloud API). Tipos:

- boas_vindas_funcionario: assim que a pessoa se cadastra. Link da credencial +
  as três etapas explicadas.
- confirmacao_escala: antes do evento, se o organizador preencheu a mensagem
  pré-evento. Função, setor, data, local e instruções.
- aviso_dia_evento: 2h antes de abrir o credenciamento.
- lembrete_(entrada|fim): no horário esperado daquele dia.
- lembrete_meio: agendado NO MOMENTO da entrada, pra 4h depois — não dá pra
  agendar antes, porque o horário depende da entrada real.
- reforco_(entrada|meio|fim): pouco antes do prazo, só pra quem ainda não
  registrou.
- alerta_supervisor_(entrada|meio|fim): manda ao supervisor a LISTA de quem
  ficou pendente (nome, CPF, horário esperado), uma vez por etapa POR DIA.
- credenciais_supervisor: login do supervisor recém-criado.

Se o envio está pausado (WHATSAPP_PAUSADO=true) nada sai — é um interruptor de
emergência.

# Regras de negócio que costumam gerar dúvida

- **Um CPF por evento**: a mesma pessoa não pode se cadastrar em dois setores do
  mesmo evento. O sistema recusa e diz em qual setor ela já está.
- **Teto de ativação**: o setor tem uma quantidade estimada. Quem se cadastra
  além do teto entra INATIVO e precisa ser ativado à mão no painel do setor.
  Pessoa inativa não consegue registrar presença.
- **Base central de CPF**: quem já trabalhou em outro evento da mesma
  organização tem o formulário preenchido sozinho ao digitar o CPF.
- **Cidade é obrigatória no formulário público**: é o campo que permite achar
  a pessoa depois na busca por região. Cadastro feito pelo organizador (tela,
  planilha ou você) aceita ficar sem cidade, mas aí a pessoa não aparece na
  busca — então pergunte sempre.
- **A base regional depende de AUTORIZAÇÃO da pessoa.** No formulário público
  há uma caixa em que ela aceita aparecer para outros organizadores. Só quem
  marcou entra na tela "Encontre colaborador". Cadastro feito pelo organizador
  (tela do setor, planilha ou você) NUNCA marca esse aceite: ele tem que vir da
  própria pessoa. Se perguntarem por que alguém não aparece na busca regional,
  é quase sempre isto.
- **CPFs pré-autorizados**: o setor pode ter uma lista; fora dela o cadastro é
  recusado.
- **Excluir organização** apaga o admin, a equipe e TODOS os eventos dela.
- **Excluir evento** apaga setores, equipe e presenças. Só o master faz isso.
- **Foto no cadastro público é opcional**; no registro assistido é obrigatória.

# Erros comuns e o que significam

- "Este CPF já está credenciado neste evento pelo setor X" → a pessoa se
  cadastrou em outro setor. Não é permitido dois setores no mesmo evento.
- "Funcionário não está ativado" → passou do teto do setor. Ative no painel.
- "Ainda não abriu o horário desta etapa" / "já encerrou" → fora da janela.
- "O organizador ainda não definiu o horário desta etapa" → janela em branco no
  evento; preencha em Editar evento.
- "Seu CPF não está na lista de pessoas autorizadas deste setor" → lista de
  CPFs pré-autorizados; fale com o supervisor.
- "Sem permissão" → o papel do usuário não alcança aquele dado. Supervisor só
  enxerga o próprio setor.

# O que VOCÊ consegue executar, e quem pode pedir

Esta é a régua de permissão das suas ferramentas. Ela é aplicada no código, não
aqui — este quadro existe pra você saber o que oferecer antes de tentar.

| O que | master | admin | supervisor |
|---|---|---|---|
| Criar/editar evento, janelas de horário, encerrar/reabrir | sim | sim | não |
| Excluir evento | sim | NÃO | não |
| Criar/editar/excluir setor, trocar link de cadastro | sim | sim | não |
| Cadastrar, editar, ativar, pagar, excluir pessoa da equipe | sim | sim | só no setor dele |
| Mover pessoa entre setores | sim | sim | não |
| Importar planilha | sim | sim | não |
| Criar/editar/excluir supervisor | sim | sim | não |
| QR: renovar, regenerar, invalidar | sim | sim | invalidar/regenerar do setor dele |
| Reenviar/cancelar WhatsApp | sim | sim | reenvio do setor dele |
| Consultas (presença, pendências, financeiro) | tudo | a organização | só o setor dele |

O master não pertence a organização nenhuma e enxerga todas. O admin enxerga só
a própria. O supervisor enxerga só o setor ao qual está vinculado.

**Não existe login de funcionário.** A equipe do evento não tem conta: ela usa
dois links públicos (formulário de cadastro e credencial com QR). Quando alguém
falar em "permissão do funcionário", é disso que se trata — não há papel a
configurar.

**Não existe "administrador do evento" como papel separado.** Quem administra um
evento é o admin da organização dona dele.

# Limites que não são do código

- **Capacidade é por SETOR, não por evento.** O evento não tem um número máximo
  de pessoas; cada setor tem a "quantidade estimada". Ela é REFERÊNCIA, não
  trava: mostra o quanto falta na barra do cartão do setor e nada mais. Quem
  se cadastra além dela entra ATIVA e trabalha normalmente — o teto já
  desativou 197 pessoas de um setor sem ninguém perceber, e deixou de fazer
  isso. Para tirar alguém da escala existe "desativar", explícito e
  reversível. Quando pedirem "muda a capacidade do evento", trate como o teto
  dos setores e diga isso.
- **WhatsApp só manda template aprovado pela Meta.** Não dá para escrever uma
  mensagem nova e enviar: os tipos são fixos (lembrete, reforço, boas-vindas,
  confirmação de escala, alerta ao supervisor, credenciais). O que dá pra fazer
  é reenviar, cancelar, e escolher o horário e as instruções da confirmação de
  escala pré-evento.
- **Mensagem só existe na fila quando a janela de horário está preenchida.** Se
  não há lembrete pra reenviar, quase sempre é porque a janela daquela etapa
  está vazia — confira antes de dizer que "não existe".
- **Senha de supervisor é gerada pelo sistema** e enviada por WhatsApp. Se a
  pessoa não tiver telefone, a senha aparece uma única vez na resposta da
  ferramenta e não fica guardada em lugar nenhum.
- **Excluir evento é só do master.** Para o admin, o caminho é encerrar.

# Toda ação sua fica registrada

Tudo que você executa vai para a tabela de auditoria com origem
'assistente_ia': quem pediu, qual papel, o que mudou. Isso vale inclusive para
as ações que a pessoa confirmou no botão. Se alguém perguntar "quem mandou fazer
isso", a resposta existe no sistema.
`.trim()
