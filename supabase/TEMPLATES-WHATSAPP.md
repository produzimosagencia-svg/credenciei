# Templates do WhatsApp (Meta Cloud API)

Estes são os 7 templates que precisam estar **aprovados no WhatsApp Manager**
antes de ligar o envio (`WHATSAPP_PAUSADO=false`). O sistema só manda template
— mensagem livre não é permitida pra conversa iniciada pela empresa.

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

**Variáveis**: 1 nome · 2 evento · 3 função · 4 setor · 5 data e local · 6 instruções do organizador · 7 link

```
Olá, {{1}}! Confirmando sua escala no evento {{2}}.

Função: {{3}}
Setor: {{4}}
Quando: {{5}}

{{6}}

Sua credencial com o QR Code: {{7}}

Qualquer impedimento, avise seu supervisor o quanto antes.
```

Exemplos: `João Silva` · `Show da Virada 2026` · `Segurança` · `Equipe de Apoio` · `dia 31/12/2026, em Arena SP` · `Usar calça preta e sapato fechado.` · `https://credenciei.vercel.app/credential/abc123`

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

## Depois de aprovar

1. Configure as variáveis de ambiente na Vercel (e no worker, se estiver usando):
   - `WHATSAPP_CLOUD_TOKEN` — token permanente do app da Meta
   - `WHATSAPP_PHONE_NUMBER_ID` — id do número, não o número em si
2. Troque `WHATSAPP_PAUSADO` para `false`.
3. Teste com um cadastro real antes de um evento de verdade — o
   `boas_vindas_funcionario` dispara na hora e é o caminho mais rápido de
   confirmar que a integração está de pé.
