# Textos das mensagens de WhatsApp

> ⚠️ **HISTÓRICO.** O sistema voltou a enviar pela **Evolution API**, que manda
> TEXTO LIVRE — não há mais template a aprovar na Meta, e nada nesta página
> precisa ser cadastrado em lugar nenhum. Os textos vivem em
> `lib/mensagens-modelos.ts`; este documento fica como referência do conteúdo e
> como receita caso um dia se volte para a Cloud API (o código continua
> produzindo `template + params`, então a volta é trocar `lib/whatsapp.ts`).
>
> Configure `EVOLUTION_URL`, `EVOLUTION_INSTANCIA` e `EVOLUTION_APIKEY`, e leia
> o aviso de banimento no topo de `lib/whatsapp.ts` antes de ligar o envio.

## Como cadastrar

No [WhatsApp Manager](https://business.facebook.com/wa/manage/message-templates/),
em **Modelos de mensagem → Criar modelo**:

- **Nome**: exatamente o nome da seção abaixo (minúsculo, com `_`).
- **Categoria**: `Utilidade` em todos (não é marketing — são avisos
  operacionais de trabalho). Categoria errada encarece e pode ser rejeitada.
- **Idioma**: `Português (BR)` — o código tem que ficar `pt_BR`.
- **Corpo**: copie o texto da seção, com `{{1}}`, `{{2}}`… nas posições exatas.
- **Exemplos**: a Meta exige um exemplo por variável pra aprovar. Use os
  valores de exemplo listados em cada template.

## Regras que valem pra todos

- **Nenhum parâmetro pode ter quebra de linha** — a Meta rejeita o envio em
  runtime (não na aprovação). Quebra de linha só no texto fixo do corpo.
- A ordem dos `{{n}}` **é a ordem do array `params`** montado em
  `lib/mensagens.ts` (`montarEnvioTemplate`). Mudar a ordem no WhatsApp Manager
  sem mudar o código troca os valores de lugar silenciosamente.
- Não comece nem termine o corpo com uma variável, e não coloque duas
  variáveis coladas (`{{1}} {{2}}` é ok, `{{1}}{{2}}` é rejeitado).

---

## 1. `boas_vindas_funcionario`

Enviado assim que a pessoa se cadastra (pelo formulário ou pelo supervisor).
É o tutorial do sistema em formato de mensagem.

**Variáveis**: 1 nome · 2 evento · 3 setor · 4 data · 5 local · 6 link da credencial

```
Olá, {{1}}! Seu cadastro no evento {{2}} foi confirmado. ✅

Setor: {{3}}
Data: {{4}}
Local: {{5}}

Sua credencial está neste link — salve nos favoritos, é ela que você vai usar durante todo o evento:
{{6}}

Como funciona no dia, em 3 etapas:

1. ENTRADA — ao chegar, procure seu supervisor e mostre o QR Code da credencial.
2. DURANTE O EVENTO — no horário indicado na credencial, abra o link e tire uma selfie você mesmo, com a localização do celular ligada.
3. SAÍDA — na hora de ir embora, mostre o QR Code de novo para o supervisor.

Cada etapa só funciona dentro do horário marcado. Vamos te lembrar por aqui na hora de cada uma.
```

Exemplos: `João Silva` · `Show da Virada 2026` · `Equipe de Apoio` · `31/12/2026` · `Arena SP` · `https://credenciei.vercel.app/credential/abc123`

---

## 2. `lembrete_credenciamento`

Enviado quando a janela de uma etapa **abre**. Serve pras três etapas — o que
muda é a instrução, que entra como variável.

**Variáveis**: 1 nome · 2 evento · 3 instrução da etapa · 4 horário limite · 5 link

```
Olá, {{1}}! Chegou a hora de registrar sua presença no evento {{2}}.

O que fazer agora: {{3}}.

Você tem até às {{4}} para registrar. Depois desse horário o sistema não aceita mais.

Sua credencial: {{5}}
```

Exemplos: `João Silva` · `Show da Virada 2026` · `Procure seu supervisor para registrar seu QR Code de entrada` · `15:00` · `https://credenciei.vercel.app/credential/abc123`

---

## 3. `reforco_credenciamento`

Mesma estrutura do lembrete, disparado pouco antes da janela fechar e **só se
a pessoa ainda não registrou**.

**Variáveis**: as mesmas 5, na mesma ordem.

```
{{1}}, atenção: sua presença no evento {{2}} ainda não foi registrada. ⏰

O que fazer: {{3}}.

O prazo encerra às {{4}}. Depois disso não dá mais para registrar.

Sua credencial: {{5}}
```

Exemplos: iguais aos do template 2.

---

## 4. `aviso_dia_evento`

Enviado 2 horas antes de abrir o credenciamento, no dia do evento.

**Variáveis**: 1 nome · 2 evento · 3 hora de abertura · 4 hora de fechamento · 5 link

```
Bom dia, {{1}}! Hoje é o dia do evento {{2}}. 🎉

O credenciamento abre às {{3}} e fecha às {{4}}. Chegue com folga e procure seu supervisor para registrar o QR Code da sua credencial.

Não esqueça que durante o evento você também precisa fazer o registro por selfie, e mostrar o QR Code de novo na saída.

Sua credencial: {{5}}
```

Exemplos: `João Silva` · `Show da Virada 2026` · `13:00` · `15:00` · `https://credenciei.vercel.app/credential/abc123`

---

## 5. `confirmacao_escala`

Enviado antes do evento, quando o organizador preenche a mensagem pré-evento.

> ⚠️ **EDITADO VIA API em 30/09/2026 (Vital, item 4) — PENDENTE DE REVISÃO.**
> Conferido direto na Graph API antes de mexer (ver
> `meta-verificar-direto-na-api` na memória do projeto): o texto real
> aprovado tinha só **7 variáveis**, não 8 como o código antigo aqui
> supunha (`rotuloCredencial` era mandado pro corpo da Meta sem nunca ter
> sido aprovado lá — o mesmo bug já achado em `aviso_dia_evento`/
> `boas_vindas_funcionario` em 28/09/2026, ver `QTD_VARIAVEIS_BODY` em
> `lib/whatsapp-meta.ts`).
>
> **Duas tentativas de edição falharam antes desta:** a 1ª (com negrito,
> emoji e a frase "caso não possa comparecer...") foi REJEITADA pela Meta
> com `INCORRECT_CATEGORY` — e o mesmo aconteceu até revertendo pro texto
> ORIGINAL idêntico ao que já estava aprovado, o que sugere que o
> classificador automático da Meta mudou de critério desde a aprovação
> original. A 2ª tentativa (texto mais simples, sem negrito/emoji/frase
> condicional) foi recusada por um motivo técnico claro, esse sim
> corrigível: "as variáveis não podem estar no início ou no fim do
> modelo" — o corpo começava com `{{1}}` e terminava com `{{7}}`,
> violando a regra que já estava documentada aqui embaixo. Corrigido
> (texto abaixo), o template ficou `PENDING` — passou da validação
> automática, está na fila de revisão humana.
>
> Até a Meta aprovar esta edição, o texto ANTERIOR (7 variáveis, sem aviso
> de uniforme) continua sendo o que chega de fato — `QTD_VARIAVEIS_BODY.
> confirmacao_escala = 8` já está certo pro texto NOVO, então evite
> reenviar por Meta Cloud API enquanto a aprovação não sai (Evolution não
> usa isto, não é afetada).

**Variáveis**: 1 nome · 2 evento · 3 função · 4 fornecedor · 5 data e
horário · 6 instruções do organizador · 7 link da credencial ·
**8 aviso de uniforme/identificação (NOVO)**

```
Olá, {{1}}! Sua escala no evento {{2}} está confirmada.

Função: {{3}}
Fornecedor: {{4}}
Data e horário: {{5}}

Instruções: {{6}}

Uniforme ou identificação exigida: {{8}}

Credencial com QR Code: {{7}}

Guarde este link.
```

Exemplos: `João Silva` · `Festival Exemplo` · `Assistente` · `Produção` ·
`30/08/2026 às 14:00` · `Chegue com 30 minutos de antecedência.` ·
`https://exemplo.com/credencial` · `Uniforme completo obrigatório, camisa
da empresa e crachá visível o tempo todo.`

Se nenhum aviso de uniforme foi configurado no evento, a variável 8 chega
como: `Consulte seu supervisor sobre uniforme ou identificação, se
exigido.` — nunca vazia (a Meta rejeita parâmetro vazio).

Texto anterior (7 variáveis, sem aviso de uniforme — o que de fato chega
enquanto esta edição não é aprovada):

```
Olá, {{1}}. Sua escala de trabalho no evento *{{2}}* foi confirmada.

👤 Função: {{3}}
🏷️ Setor: {{4}}
📅 Data e horário: {{5}}

📌 Orientações da operação: {{6}}

🔗 Acesse sua credencial pessoal com o QR Code:
{{7}}

Caso não possa comparecer, informe o supervisor responsável pela sua escala.
```

---

## 6. `alerta_supervisor_pendencia`

Vai pro supervisor, não pro funcionário. Enviado quando a janela fecha, com o
total de pendentes do setor.

**Variáveis**: 1 nome do supervisor · 2 quantidade · 3 setor · 4 etapa · 5 link do painel

```
{{1}}, atenção: {{2}} pessoa(s) do setor {{3}} não registraram a etapa {{4}}.

Veja quem está pendente no painel: {{5}}
```

Exemplos: `Maria Souza` · `3` · `Equipe de Apoio` · `Entrada` · `https://credenciei.vercel.app/admin/eventos/123/fornecedor/456`

---

## 7. `credenciais_supervisor`

Enviado uma vez, quando o supervisor é criado. Manda o login dele.

**Variáveis**: 1 nome · 2 setor · 3 evento · 4 data · 5 e-mail · 6 senha · 7 link de login · 8 link do formulário da equipe

```
Olá, {{1}}! Você foi cadastrado como supervisor do setor {{2}}, no evento {{3}}, que acontece em {{4}}.

Seu acesso ao sistema:
E-mail: {{5}}
Senha: {{6}}
Entre em: {{7}}

Para a sua equipe se cadastrar, compartilhe este link no grupo do setor: {{8}}

No sistema você acompanha quem já se cadastrou, escaneia o QR Code na entrada e na saída, e vê quem está com presença pendente.
```

Exemplos: `Maria Souza` · `Equipe de Apoio` · `Show da Virada 2026` · `31/12/2026` · `maria@exemplo.com` · `Abc12345` · `https://credenciei.vercel.app/login` · `https://credenciei.vercel.app/form/xyz789`

---

## 8. `pedido_setor_reprovado`

**Precisa ser cadastrado na Meta antes de o primeiro pedido ser negado** (enquanto o canal for a Cloud API; na
Evolution o texto já sai pronto). Enviado ao responsável pelo pedido de setor quando o administrador do evento
nega um ou mais setores — uma mensagem por pedido, listando os setores negados.

**Variáveis**: 1 nome do responsável · 2 setor(es) negado(s) · 3 evento · 4 motivo

```
Olá, {{1}}! ⚠️

Seu pedido de supervisor do(s) setor(es) {{2}} no evento {{3}} não foi aprovado.

Motivo: {{4}}.

Em caso de dúvida, fale com a organização do evento.
```

Categoria: `Utilidade` · Idioma: `Português (BR)` · Sem botões.

Exemplos: `Maria Souza` · `GOTE - LIMPEZA e BAR NORTE` · `VITAL` · `Quantidade acima do combinado`

Se a Meta ainda não aprovou, a decisão vale do mesmo jeito: o supervisor vê o motivo na página de acompanhamento do pedido.

---

## Depois de aprovar

1. Configure as variáveis de ambiente na Vercel (e no worker, se estiver usando):
   - `WHATSAPP_CLOUD_TOKEN` — token permanente do app da Meta
   - `WHATSAPP_PHONE_NUMBER_ID` — id do número, não o número em si
2. Troque `WHATSAPP_PAUSADO` para `false`.
3. Teste com um cadastro real antes de um evento de verdade — o
   `boas_vindas_funcionario` dispara na hora e é o caminho mais rápido de
   confirmar que a integração está de pé.
