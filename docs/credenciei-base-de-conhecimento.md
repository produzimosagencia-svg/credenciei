# Credenciei: base de conhecimento do produto

> Fonte de verdade sobre o que o Credenciei é, faz e promete. Agentes de copy, social media e comercial leem isto antes de escrever qualquer coisa. **Não prometer nada que não esteja aqui.**
> Levantado em 2026-09-17 lendo o código, o banco, a landing e a pasta `Escopo Do sistema/`. Onde o dado não existe, está marcado como lacuna.

---

## 1. O que é

Sistema de credenciamento e controle de presença de equipe em eventos. O organizador cadastra um evento, divide em setores, cada setor tem um supervisor e uma equipe. No dia, cada pessoa registra presença em três momentos e o organizador acompanha em tempo real.

Definição do próprio sistema em `lib/ia/conhecimento.ts`.

**Não confundir com o Produzimos.** O Produzimos vende ingresso pro público. O Credenciei controla quem trabalha no evento.

## 2. O problema que resolve

No fim do evento, o supervisor de cada setor diz quantas pessoas trabalharam, e o produtor paga com base nessa palavra. Quase ninguém confere. Resultado: produtor pagando por gente que não apareceu.

O Credenciei transforma presença em registro auditável (QR assinado, selfie, geolocalização e horário) e o relatório fecha a conta com cada fornecedor sem discussão.

**Inimigo em uma frase:** você paga por gente que não apareceu.

## 3. Origem e prova (números reais, aprovados pelo Guilherme)

- Nasceu dentro da própria produtora do Guilherme, pra conferir a equipe antes de pagar.
- Primeiro evento com a ferramenta: esperava 150 pessoas, apareceram 80. **Mais de R$ 12 mil economizados num único dia.**
- Depois de 5 meses de desenvolvimento, primeiro evento fora da produtora: **show do Henrique & Juliano, no Kleber Andrade.**

Fonte: `conteudo/roteiros/2026-09-16-credenciei-origem-12-mil.md` (roteiro escrito e aprovado pelo Guilherme).

**Pendente pra fechar o caso:** número real de credenciados no Henrique & Juliano, o que quase deu errado e imagens do dia.

## 4. Para quem

**Quem compra:** produtora e produtor de eventos, agência de ativação de marca, feira e congresso, casa de show, bar e arena.

**Quem usa:**

| Papel | Quem é | O que faz |
|---|---|---|
| `master` | o Guilherme, dono da plataforma | vê todas as organizações, cria admins, é o único que exclui |
| `admin` | o cliente produtor, dono de uma organização | vê só os dados dele, cria eventos até o limite contratado |
| `supervisor` | responsável por um setor/fornecedor | gerencia a equipe daquele setor. **Não tem scanner**: quem credencia é o posto de credenciamento |
| `operador_portao` | o posto de credenciamento, a portaria | lê QR e lança ponto manual. No menu aparece como "Gestor de credenciamento" |
| `suporte` | contratado pro dia do evento | conserta operação (CPF errado, setor errado, ponto que não bateu) sem ser dono da conta. Tem acesso com data de expiração |
| funcionário / freelancer | quem trabalha no evento | **não faz login.** Usa dois links públicos: formulário de cadastro e credencial com QR |

Papéis legados ainda no banco, fora da interface: `gerente`, `cliente`.

## 5. O fluxo completo, do evento ao portão

1. **Admin cria o evento**: nome, data de início e fim, local e as janelas de presença.
2. **Cria os setores** dentro do evento. Cada setor tem quantidade estimada, supervisor e um link de cadastro próprio, que pode ser ligado e desligado.
3. **Cria o supervisor do setor**, que recebe convite por WhatsApp com link pra criar a própria senha (vale 24h). O login dele é o CPF.
4. **O supervisor manda o link do setor no grupo do time.** O fornecedor se cadastra sozinho.
5. **O funcionário preenche o formulário público**: foto (opcional), CPF (autopreenche se já trabalhou pra essa organização), nome, telefone, e-mail, empresa, cargo, cidade, chave PIX (opcional) e o aceite pra entrar na base regional.
6. **Ao concluir, recebe WhatsApp de boas-vindas** com o link da credencial e o tutorial das três etapas.
7. **A credencial tem QR pessoal e intransferível.**
8. **Lembretes automáticos**: 2h antes de abrir o credenciamento, na abertura de cada janela, reforço pra quem não registrou e alerta ao supervisor com a lista de pendentes.
9. **No dia, três etapas de presença:**
   - **entrada**: o posto de credenciamento lê o QR;
   - **meio**: a própria pessoa abre a credencial e tira selfie, com geolocalização ligada (aqui não tem QR);
   - **saída (descredenciamento)**: QR de novo no credenciamento.
10. **Caminho alternativo, o cartaz da portaria**: quem chega sem estar na lista aponta a câmera e digita o CPF. Se já é credenciado, vai direto pro check-in; se não, cai no formulário do setor.
11. **Quem perdeu uma etapa**: supervisor ou operador resolve no registro assistido, que busca por CPF ou nome, exige foto do rosto na hora, pega GPS e grava autor, aparelho e justificativa na auditoria.
12. **Relatório pós-evento.**

## 6. O que o produto faz (confirmado no código)

**Credenciamento e portão**
- QR assinado com validade de 5 minutos, renovado pela própria tela: print antigo não funciona.
- Scanner decide sozinho se é entrada ou saída, sem botão.
- Trava de 5 minutos contra leitura dupla no mesmo QR.
- Crachá pra imprimir, pela impressão do navegador.
- Cartaz A4 de portaria com autoatendimento por CPF.
- Cadastro de veículos autorizados (placa vinculada ao CPF do condutor).

**Equipe e cadastro**
- Link de cadastro individual por setor, com liga e desliga.
- Importação de equipe por planilha (.xlsx/.csv): Nome e CPF obrigatórios; Telefone, Empresa/Setor, Cargo, Cidade, Chave PIX e Valor opcionais.
- Base central de CPF: quem já trabalhou em outro evento da mesma organização tem o formulário preenchido sozinho.
- Bloqueio de CPF, com escopo por evento.
- CPFs pré-autorizados por setor: fora da lista, o cadastro é recusado.

**Controle e prestação de contas**
- Painel em tempo real de todos os fornecedores.
- Relatórios por evento e por setor.
- Exportação em Excel: relatório completo, por setor, todos os setores em arquivos separados (.zip) e **exportar quem NÃO credenciou**.
- Auditoria com filtro por período, pessoa, setor e ação, e exportação do recorte.
- Lançamento manual de ponto, com hora escolhida e motivo escrito.
- Avisos do admin, que aparecem na credencial e no painel do supervisor, com registro de quem visualizou.
- Integração com Google Sheets.

**WhatsApp**
- Painel com conversas, caixa de entrada, disparos e fluxos.
- Fila de mensagens agendadas com retentativa, processada por cron e por um worker em VPS.
- Interruptor de emergência pra pausar todo o envio.

**Assistente de IA no painel**
- Responde "como faço X", cadastra equipe por planilha anexada no chat, e toda ação dele vai pra auditoria marcada como origem assistente.

**Plataforma**
- Multi-organização, com limite de eventos e valor cobrado por período (diário, semanal, mensal ou por evento).
- Grade de permissões editável por organização.
- Base regional "Encontre colaborador": **serviço vendido à parte**. A organização que não fecha a própria equipe contrata e o master atribui gente da base. Só aparece quem autorizou no formulário. Nenhum admin enxerga essa tela, porque entregaria a equipe de um cliente ao concorrente.

### O que o produto NÃO faz (não prometer)
- **Não gera PDF.** Relatório sai em Excel e .zip; crachá e cartaz saem pela impressão do navegador. Se a venda prometer "relatório em PDF", precisa ser construído antes.
- **Não modela imprensa nem artista.** O sistema fala em fornecedor, setor e funcionário. O posicionamento de conteúdo em `referencias/voz/contas.md` cita "imprensa e artista": lacuna a resolver com o Guilherme.
- A landing **não tem formulário**, só link de WhatsApp, e o número ainda é placeholder.

## 7. Regras de negócio peculiares (boas histórias de conteúdo)

Cada uma nasceu de um problema real no evento. Servem de prova de que o produto foi feito na operação, não na mesa.

- **Dia principal x dias de preparação.** Montagem e desmontagem têm entrada e saída livres. Dia fora da escala não é dia de trabalho e a batida é recusada: é isso que permite o relatório dizer "estava escalado pra 5 dias e veio em 4".
- **O "meio" é individual:** entrada real + 4 horas, com janela aberta por 2 horas. Quem entrou 08:00 faz das 12:00 às 14:00; quem entrou 10:30 faz das 14:30 às 16:30. As 2 horas existem porque a pessoa pode estar carregando caixa exatamente às 12:00, e falhar por isso seria injusto.
- **Turno que vira a madrugada:** teto de 18h pra decidir a que dia a saída pertence. Entrou 22:00 do dia 5 e saiu 04:00 do dia 6: a saída cai no dia 5.
- **QR de evento noturno:** se o evento atravessa a meia-noite, o crachá do evento continua válido até o término real, em vez de virar crachá de desmontagem pelo calendário.
- **Quem sai e volta no mesmo dia:** a pessoa sai no almoço e volta à tarde. Antes era recusada. Hoje a volta reabre o turno, a saída apagada vai pra auditoria e a chegada original é preservada. Limitação assumida: o relatório mostra 08:00 → 20:00, não os dois blocos.
- **Segunda leitura do mesmo QR no mesmo dia não regrava.** Responde "já registrada às HH:MM" de propósito: reescrever a entrada moveria o horário do meio junto.
- **A saída não exige o meio.** Grava a observação pra auditoria, mas não bloqueia a pessoa de ir embora.
- **Validação completa de CPF.** Foi tirada uma vez a pedido (documento estrangeiro, CPF anotado errado no papel) e voltou: um dígito errado cria um cadastro que parece normal, e a equipe não acha a pessoa quando ela chega no portão com o documento certo.
- **Um CPF por evento:** a mesma pessoa não pode estar em dois setores; o sistema diz em qual setor ela já está.
- **Só o master exclui.** Exclusão é em cascata e sem desfazer. O admin encerra evento e desativa pessoa. A fricção é proposital.
- **Teto de ativação por setor foi revertido:** virou referência, não trava, depois de desativar 197 pessoas de um setor sem ninguém perceber.
- **Convite do supervisor fura a fila de WhatsApp.** Durante o evento a fila tem centenas de lembretes, e o convite de senha ficava minutos atrás.
- **Dois interruptores por evento, independentes:** um solta o horário no dia principal (show com escala rotativa), outro solta quem registra (a própria pessoa pode bater sozinha). Ligar um não liga o outro.
- **O "meio" tem duas chaves, do setor e do dia, e as duas precisam estar ligadas.** Motivo econômico: são duas mensagens cobradas por pessoa por dia.

## 8. Preço

Única fonte: a landing (`app/page.tsx` e `app/_landing/Calculadora.tsx`).

**R$ 500 de taxa fixa por evento + R$ 1 por funcionário credenciado.** Sem mensalidade e sem licença por usuário. Setores, operadores, lembretes por WhatsApp e relatórios inclusos. A página tem calculadora de 50 a 3.000 pessoas.

O motor de cobrança já aceita diário, semanal, mensal ou por evento, mas a landing vende só por evento. A tabela pra casa de show e bar (possível assinatura mensal) está em branco no escopo: **lacuna**.

"Encontre colaborador" é vendido à parte, **sem preço definido**.

## 9. Copy que já existe na landing

- **Título da página:** Credenciei, credenciamento de equipes para eventos.
- **H1:** Toda a equipe do seu evento credenciada, sem fila e sem planilha.
- **Subhead:** Fornecedores cadastram a equipe por link, cada pessoa recebe um QR único e o check-in no portão fica registrado: quem entrou, por onde e a que hora.
- **CTAs:** Fale com o nosso time / Ver como funciona.
- **Três passos:** Fornecedores cadastram a equipe por link · Cada pessoa recebe um QR único · Check-in no portão, registrado.
- **Três benefícios:** Controle (100% dos acessos com rastro) · Economia (R$ 0 por quem não foi) · Praticidade (menos de 3s por check-in).
- **Preço:** Um valor por evento. Um real por pessoa.
- **CTA final:** Seu próximo evento começa com a equipe certa passando pelo portão certo.
- **Tagline de marca:** Credenciei, credenciamento para eventos.
- **Rodapé:** credenciei.com.br

### Placeholders na landing (NÃO usar como prova)
- Os seis logos de clientes.
- Os três depoimentos (assinados "Nome do produtor", "Nome da produtora", "Nome do gerente"). **Não existe nenhum depoimento real.**
- O número do WhatsApp comercial.
- Os números do hero (+4.800 profissionais credenciados, 1.008 pessoas num único evento, menos de 3s por check-in) **não têm fonte confirmada**. Validar contra o banco antes de usar em venda.

## 10. Lacunas (perguntar ao Guilherme antes de prometer)

1. De onde saem os três números do hero da landing.
2. Número real de credenciados no Henrique & Juliano, com o que quase deu errado e imagens.
3. Tabela de preço e plano pra casa de show e bar (assinatura mensal).
4. Preço do "Encontre colaborador".
5. O que entra em treinamento do gestor operacional e suporte no dia, e se suporte presencial é cobrado à parte.
6. Argumentário de objeções: "meus freelancers não vão saber usar", "e se não tiverem celular", "como fica a segurança dos dados".
7. **LGPD.** O sistema coleta CPF, foto do rosto e geolocalização. Não existe política de privacidade, termo de consentimento redigido nem contrato no repositório. Só há o aceite da base regional.
8. Valor do deal de Manaus e se há outros leads ou clientes fora do cofre.
9. Existe contrato-modelo?
10. Divergência escopo x código: o escopo diz que o check-in do meio é por sorteio, sem aviso de horário; o código faz entrada + 4h fixas. Qual versão comunicar?
11. Divergência interna: o operador de portão é vinculado ao evento ou à organização inteira?
12. URL de produção: o rodapé diz `credenciei.com.br`, os templates de WhatsApp apontam pra `credenciei.vercel.app`. E o envio de WhatsApp está ligado hoje?
13. Existem logos e depoimentos reais pra substituir os placeholders?
14. Três materiais citados no escopo e não encontrados: "Regras de Credenciamento", "Manual do Fornecedor" e "Segurança do Trabalho, Orientações".
15. Quem é o "Juan" citado como decisor em dezenas de comentários de código e commits de setembro de 2026? Não há menção a ele em nenhum lugar do cofre.

## 11. Processo comercial (do escopo)

1. Prospecção e qualificação: volume de freelancers por evento, frequência e como credencia hoje.
2. Antes da call de alinhamento, enviar vídeo de 1 minuto no WhatsApp.
3. Demonstração do fluxo completo, diagnóstico da dor (tempo do credenciamento manual, fraude, gente que diz que credenciou e não credenciou), proposta, objeções, fechamento.
4. Kickoff, definição e treinamento do gestor operacional de credenciamento, configuração do evento, **simulação com grupo pequeno antes do evento**, suporte no dia e relatório pós-evento.

Fonte: `Escopo Do sistema/CREDENCIEI Guias de Processo.docx`.
