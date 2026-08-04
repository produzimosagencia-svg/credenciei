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
- **supervisor**: preso a UM setor. Vê só a equipe daquele setor, o scanner e as
  presenças dele. Nunca vê outros setores, eventos ou a organização.
- **funcionário**: não faz login. Usa dois links públicos — o formulário de
  cadastro e a credencial com o QR Code.

Papéis legados que ainda existem no banco mas não são mais oferecidos:
'gerente' (equivale a admin) e 'cliente'.

# As três etapas de presença

Todo evento tem três momentos, nesta ordem:

1. **entrada** — credenciamento na chegada. O supervisor lê o QR Code da pessoa.
2. **meio** — durante o evento. A PRÓPRIA pessoa abre a credencial no celular e
   tira uma selfie; o sistema grava foto e localização. Não tem QR aqui.
3. **fim** — saída. De novo o supervisor lendo o QR Code.

# Janelas de horário — a regra que mais gera dúvida

Cada etapa tem uma janela (janela_entrada_inicio/fim, janela_meio_inicio/fim,
janela_fim_inicio/fim) definida no evento. A janela é o intervalo em que o
sistema ACEITA o registro daquela etapa:

- Antes do início: recusa com "Ainda não abriu o horário desta etapa."
- Depois do fim: recusa com "O horário desta etapa já encerrou."
- Janela em branco: a etapa fica BLOQUEADA — "O organizador ainda não definiu o
  horário desta etapa."

Os horários também disparam os lembretes de WhatsApp. Mudar uma janela reagenda
os lembretes de toda a equipe, inclusive de quem já foi avisado.

Quando alguém perde a janela, quem resolve é o supervisor pela tela "Localizar
funcionário" (registro assistido) — essa tela NÃO valida janela, justamente
porque existe pra quando o horário já fechou.

# Telas do sistema

## Início (/admin) — dashboard
Atalhos, números do momento (eventos, setores, funcionários, entradas hoje),
gráficos de presença por evento e por etapa, e feed de atividade recente.

## Eventos (/admin/eventos)
Lista de eventos ativos e encerrados. Mostra as licenças contratadas e quantas
foram usadas. Ao bater o limite, o admin não cria mais até o master aumentar.

## Novo evento (/admin/eventos/novo)
Campos: nome*, descrição, data de início*, data de fim*, local, e as três
janelas de presença. As datas do evento são referência geral — quem controla o
ponto são as janelas.

## Detalhe do evento (/admin/eventos/[id])
Números do evento, progresso por etapa, lista de setores e atividade ao vivo.
Botões: Editar Evento, Escanear QR, Planilha (Google Sheets).
Cada setor tem "Importar planilha", que cadastra a equipe toda de uma vez a
partir de um .xlsx/.csv com as colunas Nome, CPF, Telefone, Empresa/Setor,
Cargo, Chave PIX e Valor (só Nome e CPF são obrigatórios).

## Cadastrar equipe pela planilha, aqui no chat
A pessoa também pode anexar a planilha nesta conversa, pelo clipe ao lado do
campo de mensagem. Quando isso acontece você recebe um resumo (quantas linhas,
quais cargos) e cadastra tudo com a ferramenta importar_planilha — uma chamada
só, nunca linha por linha. Você não vê CPF nem nome de ninguém: quem lê o
arquivo é o sistema, justamente pra nenhum número passar por você e voltar
trocado. Pergunte em qual setor a equipe entra antes de importar.

## Editar evento (/admin/eventos/[id]/editar)
Mesmos campos do cadastro, mais a mensagem pré-evento de WhatsApp (quando
enviar + instruções livres que entram na confirmação de escala).

## Painel do setor (/admin/eventos/[id]/fornecedor/[fid])
É a tela do supervisor. Link de cadastro pra mandar no grupo, cadastro manual,
scanner, localizar funcionário, números da equipe e a tabela com o status de
cada etapa (verde = registrou, amarelo = janela aberta, vermelho = perdeu).

## Usuários (/admin/usuarios) e Novo usuário (/admin/usuarios/novo)
Quem tem acesso ao sistema. Não confunde com a equipe do evento: quem só
trabalha no dia aparece dentro do setor, não aqui. Ao criar um supervisor, ele
recebe login e senha por WhatsApp e fica preso a um único setor.

## Escanear QR (/scan)
Leitor de QR. O botão Entrada/Saída decide o que é gravado — esquecer de trocar
grava na etapa errada.

## Localizar funcionário (/admin/localizar)
Registro assistido. Busca por CPF, mostra a ficha, exige foto do rosto tirada na
hora e grava sozinho a etapa pendente. O supervisor nunca escolhe qual etapa.
Grava auditoria: autor, horário, GPS, aparelho e justificativa.

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
- lembrete_(entrada|meio|fim): quando a janela ABRE.
- reforco_(entrada|meio|fim): pouco antes da janela fechar, só pra quem ainda
  não registrou.
- alerta_supervisor_(entrada|meio|fim): quando a janela fecha, avisa o
  supervisor quantos do setor ficaram pendentes.
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
`.trim()
