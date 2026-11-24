# Mapa da arquitetura do Credenciei

> Mapa técnico completo do sistema. O agente `dev-credenciei` lê isto antes de qualquer tarefa, junto com o `AGENTS.md` da raiz.
> Levantado em 2026-09-17 direto do código, no commit `e3f16c9`. **Se o mapa divergir do código, o código manda: corrija o mapa.**
> Regra de negócio e posicionamento ficam em `docs/credenciei-base-de-conhecimento.md`.

Repositório: `/Users/guilherme/Documents/Cofre/Cofre/deals/Projeto Credenciei/credenciei`
Git: branch `main`, remote `https://github.com/produzimosagencia-svg/credenciei.git`.
Único arquivo não versionado no momento da varredura: `app/api/leads/` (untracked, feature nova ainda não commitada).

Stack confirmada em `package.json`: Next.js **16.2.9**, React **19.2.4**, `@supabase/ssr` 0.12, `@supabase/supabase-js` 2.108, Tailwind **v4** (via `@tailwindcss/postcss`), `@google/genai` 2.15, `googleapis` 173, `exceljs`, `xlsx`, `jszip`, `qrcode`, `html5-qrcode`, `recharts`, `lucide-react`, `date-fns`.
Scripts: `dev` (`next dev --turbopack`), `build`, `start`, `lint` (`eslint`), `coerencia` (`node testes/coerencia.mjs`).
`next.config.ts`: `allowedDevOrigins: ['192.168.15.123']`, `devIndicators: false`, `experimental.serverActions.bodySizeLimit = '5mb'` (por causa das fotos de presença enviadas por server action).
`tsconfig.json`: alias `@/* → ./*`; **`worker` está no `exclude`** (o worker não é type-checked junto do app).
`node_modules` NÃO está instalado neste checkout (não consegui listar `node_modules/next/dist/docs/`).

---

## 1. ROTAS E ÁREAS DO APP (`app/`)

### 1.1 Públicas (sem sessão): liberadas explicitamente em `proxy.ts`

| Rota | Arquivo | O que faz |
|---|---|---|
| `/` | `app/page.tsx` (+ `app/_landing/`) | Landing comercial pública. Server component, textos/preços fixos no arquivo. Placeholders assumidos: 6 logos de clientes, 3 depoimentos e `WHATSAPP_COMERCIAL = 'https://wa.me/5500000000000'`. Usa `app/_landing/landing.module.css` (CSS Module próprio, fora do design system do painel), `Revelar.tsx` (animação de revelação no scroll) e `Calculadora.tsx` (calculadora de economia). |
| `/login` | `app/login/page.tsx` | Client component. Só chama `POST /api/auth/login` e, no sucesso, faz `window.location.href = '/admin'` (recarrega em vez de navegar, para o cookie recém-gravado valer na 1ª renderização). UI vem de `components/ui/modern-stunning-sign-in.tsx`; imagem em `app/login/imgTela1.jpg`. |
| `/form/[token]` | `app/form/[token]/page.tsx` + `FormularioFuncionario.tsx` | Formulário público de cadastro da equipe, por SETOR. `token` = `fornecedores.token_formulario`. Valida CPF, autopreenche a partir da base, sobe foto, pede consentimento, chave PIX opcional, agenda boas-vindas. Aceita `?de=portaria` para gravar a origem do cadastro. Tem tutorial guiado embutido. |
| `/credential/[token]` | `app/credential/[token]/page.tsx` | A credencial do funcionário. `token` = `funcionarios.qr_token`. Mostra QR (`QrProtegido.tsx`), os 3 cartões de etapa (`CheckinPresenca.tsx`), check-in autônomo com geolocalização (`EscanearLocal.tsx`), aviso de manter cadastro atualizado (`ManterAtualizado.tsx`), modais de aviso. |
| `/portaria/[token]` | `app/portaria/[token]/page.tsx` + `IdentificarPorCpf.tsx` | Cartaz impresso na entrada. `token` = `eventos.token_portaria`. NÃO cadastra: identifica por CPF (já credenciado → manda direto pro check-in) ou lista os setores e joga a pessoa no `/form/<token_formulario>?de=portaria`. Protegida só pelo token + `eventos.portaria_ativa`. |
| `/supervisor/criar-senha/[token]` | `page.tsx`, `FormCriarSenha.tsx`, `actions.ts` | Convite de primeira senha do supervisor. Token de convite (24h) resolvido por `lib/supervisor-convite.ts`. Regras da senha em `actions.ts`: ≥8 caracteres, ≤128, ao menos 1 letra e 1 dígito, confirmação igual. |
| `/marca/*` | `public/marca/` | Assets da marca, liberados no proxy porque landing e login não têm sessão. |

Erro/404 globais: `app/error.tsx`, `app/not-found.tsx`. Root layout: `app/layout.tsx`.

### 1.2 Autenticadas: `/scan`

`app/scan/page.tsx` (server): exige `getPerfil()` e `podeEscanear(perfil)`, senão redirect `/login` ou `/admin`. Lista só os eventos escaneáveis do usuário (`eventosEscaneaveis`).
`ScannerView.tsx` (client): câmera via `html5-qrcode`, leitura contínua (sem botão entrada/saída, o servidor decide pela ordem das batidas do dia). `ConferenciaCpf.tsx`: consulta "esta pessoa está credenciada?" por CPF quando o QR não serve, **não registra ponto de propósito**.

### 1.3 Autenticadas: `/admin` (painel)

`app/admin/layout.tsx`: `getPerfil()` → redirect `/login` se nulo; busca nome/foto da organização (storage `presencas`, URL assinada 1h) e `meusSetores(perfil)`; renderiza `components/AppShell.tsx`.

O menu (`gruposPara(role)` em `AppShell.tsx`) é a melhor fonte de verdade de "quem vê o quê":

**Grupo "Evento"**
- `/admin`: Painel (todos). `app/admin/page.tsx`, 859 linhas: KPIs, eventos ativos/encerrados, gráficos, faixa de saúde do WhatsApp.
- `/scan`: Scanner, só `podeEscanear`.
- `/admin/editar-evento`: escolhe o evento e cai no editor; `podeGerenciarEventos`.
- `/admin/editar-colaborador`: `podeGerenciarEventos` **ou** `suporte`. Componente `BuscarColaborador.tsx`.
- `/admin/criar-porteiro`: rotulado "Gestor de credenciamento"; cria `operador_portao`; `podeGerenciarUsuarios`.
- `/admin/veiculos`: `podeGerenciarVeiculos` (master/admin/suporte). `PainelVeiculos.tsx`, `FormVeiculo.tsx`, `FotoVeiculo.tsx`, `AcoesVeiculo.tsx`.
- `/admin/localizar`: "Registro de ponto" (ponto assistido); `podeAcompanhar`. `LocalizarFuncionario.tsx`.
- `/admin/atividades`: feed de atividades do evento; `podeAcompanhar`.
- "Meus setores" (`components/MeusSetores.tsx`) aparece logo abaixo do 1º grupo, só para supervisor com >1 setor.

**Grupo "Administrativo"**
- `/admin/avisos`: `podeGerenciarEventos`.
- `/admin/lancar-ponto`: lançamento manual retroativo com motivo; `podeGerenciarEventos` | `supervisor` | `suporte`. (Deliberadamente sem `operador_portao`.)
- `/admin/bloquear-cpf`: `podeGerenciarEventos` | `supervisor` | `suporte`. `PainelBloqueio.tsx`.
- `/admin/relatorios`: `podeGerenciarEventos` | `supervisor`.
- `/admin/usuarios` (+ `/novo`): "Acessos"; `podeGerenciarUsuarios`.
- `/admin/auditoria`: `podeGerenciarUsuarios` | `suporte` (suporte vê só o que ele mesmo fez; régua reaplicada no servidor em `obterAuditoria`). `FiltrosAuditoria.tsx`.

**Grupo "Operacional" (só master)**
- `/admin/organizacoes` (+ `/novo`): tenants.
- `/admin/suporte`: cria/edita/revoga perfis `suporte` e o escopo deles.
- `/admin/encontrar`: "Encontre colaborador" (fusão de duas telas antigas; toggle "Prontas para recrutar / Toda a base").
- `/admin/whatsapp`: visão geral do canal, com sub-abas.
- `/admin/configuracoes`: grade de permissões por organização (`GradePermissoes.tsx`). Só master, sem rótulo de grupo, isolada de propósito.

**Rotas de evento (`/admin/eventos/[id]/...`)**
- `/admin/eventos/[id]`: detalhe: cards de fornecedor/setor, supervisores, operadores de portaria, links de cadastro, importação de planilha, feed de atividade, lista de setores.
- `/admin/eventos/[id]/editar`: janelas, dias de trabalho (`DiasDeTrabalho.tsx`), configuração do meio (`ConfiguracaoDoMeio.tsx`).
- `/admin/eventos/[id]/fornecedor/[fid]`: painel do SETOR: tabela de funcionários, modal de detalhe, novo funcionário, troca de setor, CPFs duplicados, auto-refresh.
- `/admin/eventos/[id]/avisos`: mural de comunicados + visualizações.
- `/admin/eventos/[id]/presenca`: "quem fez / quem não fez" do dia (`TabelaPresenca.tsx`).
- `/admin/eventos/[id]/relatorios`: exportação `.xlsx`.
- `/admin/eventos/[id]/portaria`: **o cartaz A4 para imprimir** com o QR da portaria (usa `NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'`).
- `/admin/eventos/novo`: criação de evento.
- `/admin/funcionarios/[id]/historico`: histórico dia a dia de uma pessoa num evento.
- `/admin/pessoas/[cpf]`: ficha da pessoa na base geral + `AtribuirEvento.tsx`.

**Redirecionamentos legados (existem só para não dar 404):**
- `/admin/eventos` → `/admin` (a lista foi pro Painel)
- `/admin/base-funcionarios` → `/admin/encontrar?ver=todos`
- `/admin/clientes` → `/admin/usuarios`
- `/admin/eventos/[id]/pendencias` → `/admin/eventos/[id]/presenca` (repassa `?dia`)

**WhatsApp (`/admin/whatsapp`, layout próprio com abas)**
- `/admin/whatsapp`: visão geral do canal
- `/admin/whatsapp/conversas` e `/conversas/[telefone]`: inbox/chat (com CSS module próprio `mensagens.module.css`, rolagem, responder, perfil do contato, atualização ao vivo)
- `/admin/whatsapp/disparo`: disparo em massa com prévia de destinatários
- `/admin/whatsapp/fluxos`: liga/desliga cada aviso automático sem deploy

### 1.4 Rotas de API (`app/api/**/route.ts`): 11 rotas

| Rota | Método | Auth | Função |
|---|---|---|---|
| `app/api/auth/login/route.ts` | POST | pública | Login. Traduz o identificador digitado via `identificadorParaEmail` (e-mail real, CPF ou nome de usuário legado) e faz `signInWithPassword`. Trata "CPF com nº de dígitos errado" com mensagem própria antes de chamar o Supabase. |
| `app/api/auth/google/authorize/route.ts` | GET | `getPerfil()` + `ehMaster` (desde 20/09/2026; antes **nenhuma**) | Redireciona para o consent do Google OAuth (scopes `spreadsheets` + `drive`), `access_type=offline`, `prompt=consent`. |
| `app/api/auth/google/callback/route.ts` | GET | `getPerfil()` + `ehMaster` (desde 20/09/2026; antes **nenhuma**) | Troca o `code` por tokens e **escreve `GOOGLE_REFRESH_TOKEN` dentro de `.env.local` com `fs.writeFileSync`**. Ferramenta de setup local, não funciona (e não deveria rodar) na Vercel. |
| `app/api/cron/enviar-mensagens/route.ts` | GET | `Authorization: Bearer ${CRON_SECRET}` | Chama `processarFilaMensagens()`. Fallback do worker da VPS; acionada pelo Vercel Cron a cada minuto (`vercel.json`). Se `CRON_SECRET` não estiver definida, responde 401 sempre. |
| `app/api/drive-cleanup/route.ts` | POST | `getPerfil()` + `ehMaster` + header `x-confirmar-limpeza: apagar-planilhas` | Apaga TODOS os arquivos não-pasta do Drive da service account. Comentário no arquivo registra que nasceu como GET sem auth. |
| `app/api/ia/chat/route.ts` | POST | `getPerfil()` (401 sem sessão) | Conversa com o assistente Gemini. Stream NDJSON (`{t:'texto'|'ferramenta'|'confirmar'|'erro'}`). `maxDuration = 120`. Teto de 1000 linhas por planilha anexada (413 acima). Perfil sempre lido da sessão, nunca do body. 503 se `GEMINI_API_KEY` ausente. |
| `app/api/import/funcionarios/route.ts` | POST | `podeGerenciarEventos` OU `supervisor` (restrito aos setores dele via `supervisor_setores` / `perfis.fornecedor_id`) | Importação em lote → `lib/importacao.ts`. `maxDuration = 60` por causa do espelho no Sheets via `after()`. |
| `app/api/leads/route.ts` | POST | **pública** | Captação de lead da landing. `runtime = 'nodejs'`. Insere em `leads` com service role: `name`, `email`, `whatsapp`, `source:'credenciei-site'`, `products`, `classification:'Novo'`, `score:0`, `utm_source/medium/campaign`. Exige nome + (e-mail ou whatsapp). Teto de envios desde 20/09/2026 (`podePassar`: 5 por IP a cada 10 min e 200/h no geral) e o erro vai pro log sem o objeto cru do PostgREST (o `details` ecoava o e-mail do lead). **A tabela `leads` não existe em nenhum SQL deste repositório**, deve viver no Supabase compartilhado. |
| `app/api/sheets/funcionario/route.ts` | POST | `getPerfil` + `podeGerenciarEventos` + prova de que o funcionário é da org do chamador | Reescreve a linha do funcionário na planilha do Google. |
| `app/api/sheets/registro/route.ts` | POST | idem + evento da própria org; `tipo` ∈ {entrada, saida} | Escreve uma batida na planilha. |
| `app/api/whatsapp/webhook/route.ts` | GET + POST | GET: `hub.verify_token === WHATSAPP_VERIFY_TOKEN`. POST: HMAC-SHA256 do corpo cru com `META_APP_SECRET` em `x-hub-signature-256`, comparado com `timingSafeEqual` | GET = handshake da Meta (responde o challenge em text/plain). POST = grava mensagens recebidas e status em `whatsapp_eventos` (linha a linha, ignorando 23505); status `failed` volta pra `mensagens_agendadas.erro` com o prefixo exportado `MARCA_NAO_ENTREGUE = 'NÃO ENTREGUE, '`. Sempre responde 200. |

---

## 2. AUTENTICAÇÃO E AUTORIZAÇÃO

### Login
- Supabase Auth por e-mail/senha. Como o supervisor não tem e-mail, `lib/usuario.ts` converte o identificador num endereço interno no domínio reservado **`supervisor.credenciei`**:
  - com `@` → e-mail real (admin/master), passa direto;
  - 11 dígitos → `cpfParaEmail` → `12345678900@supervisor.credenciei` (formato atual);
  - outro → `usuarioParaEmail(normalizarUsuario(...))` → `joao.bar@supervisor.credenciei` (formato legado, mantido para não trancar contas antigas).
- `POST /api/auth/login` grava os cookies; a página de login recarrega em `/admin`.
- Logout: `AppShell` usa `createBrowserClient` + `supabase.auth.signOut()` e `router.push('/login')`.

### Middleware: `proxy.ts` (raiz, NÃO `middleware.ts`)
Convenção nova do Next 16: o arquivo exporta `proxy(request)` e um `config.matcher`.
- Allowlist pública explícita: `/form/`, `/credential/`, `/portaria/`, `/supervisor/criar-senha/`, `/login`, `/` e `/marca/`.
- Para o resto: monta `createServerClient` e faz `supabase.auth.getSession()` (leitura local do cookie). Sem sessão → redirect `/login`. O comentário deixa claro que isso é **redirect otimista**; a checagem autoritativa é `getPerfil()` (que usa `auth.getUser()`) no `admin/layout.tsx`.
- `matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)']` → **as rotas `/api/*` não passam pelo proxy**; cada route handler se protege sozinho.
- `testes/coerencia.mjs` grupo 6 valida que as 4 rotas públicas continuam listadas aqui.

### Sessão no servidor: `lib/supabase-server.ts`
- `createClient()`: cliente SSR com cookies do Next.
- `getSession()`: `auth.getSession()`.
- `supabaseAdmin`: service-role, criado no escopo do módulo. **É o único caminho real de acesso ao banco** (RLS ligado sem policies). Comentário: "NUNCA importar isto em componentes de browser".
- `getPerfil()`: `cache()` do React (1x por request): `auth.getUser()` → `perfis` por id (via service role). Devolve `null` se `ativo === false` ou se `acesso_expira_em` já passou. Carrega `data.permissoes` com as exceções da organização (`excecoesDePermissao`), com fallback tolerante se a tabela `permissoes_organizacao` não existir (flag de módulo `tabelaDePermissoesAusente` evita repetir a consulta que falha).
- `buscarTudo()`: pagina resultados para furar o teto de 1000 linhas do PostgREST (`db.max_rows`). Documentado como causa real de bugs "1000 fixo" no Painel.
- `licencasDeEventoRestantes`, `meuSetor`, `meusSetores`, `eventosEscaneaveis`, `podeEscanearEvento`, escopo por organização/setor.

### Papéis: `lib/permissions.ts`
`type Role = 'master' | 'admin' | 'supervisor' | 'gerente' | 'cliente' | 'operador_portao' | 'suporte'`
- **master**: dono da plataforma, `organizacao_id = null`, acesso irrestrito. **Nunca afetado pelas exceções de permissão** (trava em `resolver()`, para a tela de permissões não se trancar sozinha).
- **admin**: dono de UMA organização; cria equipe e eventos até `organizacoes.limite_eventos`; não exclui.
- **supervisor**: preso a setor(es) via `perfis.fornecedor_id` (o setor "aberto agora") + `supervisor_setores` (todos os que ele pode abrir). **Não escaneia** (decisão explícita), mas acompanha.
- **operador_portao**: vinculado ao evento inteiro (`fornecedor_id` nulo); só lê QR e registra ponto.
- **suporte**: acesso contratado para o dia do evento, com escopo em `suporte_escopo` (organização OU evento, XOR) e expiração em `perfis.acesso_expira_em`. Corrige operação, nunca administra.
- **gerente / cliente**: legados, ainda válidos no CHECK do banco, não oferecidos na UI; `gerente` é tratado como admin.

Capacidades (função `capacidade(chave, padrao)` = padrão do código + exceção da org):
`veTodosEventos` (`ver_todos_eventos`), `podeGerenciarOrganizacoes`, `podeGerenciarUsuarios` (`gerenciar_acessos`), `podeGerenciarEventos`, `podeExcluir` (`excluir`, só master; `podeExcluirEventos` é alias `@deprecated`), `podeExcluirDaEquipe`, `podeEditarIdentidade` (`corrigir_cpf`), `podeGerenciarVeiculos`, `podeEscanear`, `podeAcompanhar`.
`CAPACIDADES[]` alimenta a tela de Configurações com `padrao` apontando para a própria função (a coluna "como é hoje" nunca desatualiza). `PAPEIS_CONFIGURAVEIS = ['admin','supervisor','operador_portao','suporte']`.

Precedência de permissão: **linha da organização > linha da plataforma (`organizacao_id` nulo) > padrão do código**. Tabela vazia = comportamento de antes.

### No cliente
Componentes client recebem `role` como string e chamam as mesmas funções de `lib/permissions.ts` (que aceitam `string | perfil`). Passar só a string ignora as exceções da organização, está documentado em `AlvoPermissao`. A régua do menu é cosmética; a proteção real é nas actions/rotas.

---

## 3. CAMADA DE DADOS (`lib/`): 39 arquivos na raiz + 11 em `lib/ia/`

**Clientes Supabase**
- `lib/supabase.ts` (56 l.): cliente anon para browser + **tipos legados** `Evento/Fornecedor/Funcionario/Setor/Registro` (desatualizados, ver §9).
- `lib/supabase-server.ts` (271 l.): **ponto de entrada de tudo no servidor**: `createClient`, `supabaseAdmin`, `getPerfil`, `buscarTudo`, escopos.

**Regras de negócio / domínio**
- `lib/actions.ts` (**6161 linhas**, `'use server'`): o coração. ~80 server actions exportadas, seções: Organizações · Supervisores · Suporte de Sistema · Eventos · Fornecedores · Setores · QR Codes · Funcionários · Google Sheets · Jornadas/Dias de trabalho · Presença (QR + foto) · Bloqueio de CPF · Cadastro público · Portaria · Configuração do meio · Avisos · Veículos · Permissões. Destaques: `registrarPresencaQR`, `registrarPresencaFoto`, `registrarPresencaLivre`, `registrarPresencaAssistida`, `lancarPontoManual`, `apagarBatida`, `cadastrarFuncionarioPublico`, `cadastrarFuncionarioEmergencial`, `identificarNaPortaria`, `descredenciarFuncionario`, `recredenciarFuncionario`, `bloquearCpf`, `editarCpfFuncionario`, `salvarDiasDeTrabalho`, `obterAuditoria`.
- `lib/janelas.ts` (575 l.): **regras puras de horário, sem banco**. Constantes `HORAS_ATE_MEIO = 4`, `DURACAO_JANELA_MEIO_H = 2`, `TETO_TURNO_H = 18`, `ENTRADA_PADRAO '08:00'`, `LIMITE_PADRAO_ENTRADA '12:00'`, `LIMITE_PADRAO_SAIDA '23:59'`, `HORA_AVISO_DIA '07:00'`. Tipos `TipoDia ('principal'|'preparacao')`, `FaseDoDia ('montagem'|'evento'|'desmontagem')`, `DiaDaJornada`, `HorariosEsperados`. Funções: `diaBRT`, `periodoDoEvento`, `ehDiaPrincipal`, `janelaDoMeio`/`janelaMeio`, `dentroDaJanela`, `avaliarEntradaSaida`, `horariosEsperados`, `faseDoDia`, `faseAtualDoQR`, `liberacaoDoQR`, `conferirHorariosDoEvento`.
- `lib/meio.ts`, `lib/pendencias.ts`, `lib/presenca-visoes.ts`, `lib/historico.ts`, meio individual, listas de pendência, visões de presença, histórico derivado (falta NÃO é linha no banco: é a diferença entre `jornada_dias` e `registros`).
- `lib/permissions.ts`, `lib/usuario.ts`, `lib/suporte.ts` (escopo do suporte), `lib/auditoria.ts` (gravador único de `alteracoes_cadastro`) + `lib/auditoria-rotulos.ts` (texto puro, separado para não puxar a service key pro bundle do browser).
- `lib/cadastro-individual.ts` (link individual, validade 48h), `lib/supervisor-convite.ts` (convite de senha, 24h), `lib/limite.ts` (rate limit em memória para actions públicas), `lib/saude.ts` (último estado do canal WhatsApp), `lib/avisos.ts`, `lib/cobranca.ts`, `lib/cidades.ts` (lista fechada de cidades do ES), `lib/format.ts` (CPF/CNPJ/telefone/`chaveBusca`/`validarCpf`), `lib/tz.ts` (BRT fixo `-03:00`), `lib/erros.ts` (tradutor de erros), `lib/navegador.ts` (detecta WebView do WhatsApp, câmera e geolocalização não funcionam lá), `lib/url.ts`, `lib/geocoding.ts` (Nominatim/OSM, sem chave).

**QR / credencial**
- `lib/credencial-qr.ts` (196 l.): **ponto de entrada**. Formato atual `c3` (HMAC cobre credencial + ETAPA), `c2` legado (cobria o dia) ainda aceito, `c1` nunca mais. Chave = `CREDENCIAL_SEGREDO` **ou**, por padrão, `SUPABASE_SERVICE_ROLE_KEY`. Siglas: `m` montagem, `p` evento (principal), `d` desmontagem.

**Importação / planilhas / exportação**
- `lib/importacao.ts`: ponto de entrada do cadastro em lote (usado pela rota de import e pela IA).
- `lib/planilha.ts`: leitura/exportação **no navegador** (`xlsx`); tipo `LinhaPlanilha`.
- `lib/relatorios.ts` (`'use server'`, sempre valida `exigirAcessoAoEvento`) busca os dados; `lib/relatorio-excel.ts` monta e baixa o `.xlsx` **no cliente** (import dinâmico de `exceljs`).
- Modelo em `public/modelo-importacao.xlsx`.

**Google**
- `lib/google-sheets.ts` (325 l.): ponto de entrada. Usa OAuth2 com `GOOGLE_REFRESH_TOKEN` quando existe, senão service account (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`). Cria planilha por evento, aba por fornecedor, pasta por cliente, escreve funcionários/presenças/valores.

**Mensageria WhatsApp**
- `lib/whatsapp.ts`: **o seletor**. `provedor()` = `WHATSAPP_PROVEDOR` ou, sem ela, `WHATSAPP_TOKEN ? 'meta' : 'evolution'`. Expõe `enviarMensagem` (template+params para Meta, texto pronto para Evolution), `responderConversa`, `estadoDaInstancia`, `ESPACAMENTO_MS`.
- `lib/whatsapp-meta.ts` (Cloud API oficial) e `lib/whatsapp-evolution.ts` (WhatsApp Web não-oficial, com `delay` simulando digitação).
- `lib/mensagens.ts` (**1449 l.**): fila. `TipoMensagem`: `lembrete_entrada|meio|fim`, `alerta_supervisor_*`, `reforco_*`, `confirmacao_escala`, `aviso_dia_evento`, `boas_vindas_funcionario`, `aviso_montagem`, `aviso_desmontagem`, `disparo_manual`. Exporta `sincronizarAgendamentos`, `cancelarMeioDesligado`, `agendarMeioAposEntrada`, `agendarBoasVindasFuncionario`, `agendarTemplateSupervisor`, **`processarFilaMensagens`**, `previsualizarMensagem`. Constantes: `ATRASO_MAXIMO_MIN = 180`, `BATCH_SIZE_PADRAO = 10`, pacing aleatório 1000–2000 ms, `BACKOFF_MINUTOS = [2,10,30]`, `HORA_AVISO_DIA_EVENTO = '07:00'`, `ANTECEDENCIA_AVISO_DIA_HORAS = 2`.
- `lib/mensagens-modelos.ts`: os textos (template → texto para a Evolution).
- `lib/whatsapp-painel.ts` (666 l.): o que o painel lê/escreve (conversas, campanhas). `lib/actions-whatsapp.ts`, actions do painel, **todas `ehMaster`**.

**IA (Gemini, `@google/genai`)**
- `lib/ia/agente.ts`: modelo **`gemini-3.6-flash`**, `MAX_VOLTAS = 8`, systemInstruction.
- `lib/ia/conhecimento.ts` (360 l.): base de conhecimento estável (pensada para cache de prompt).
- `lib/ia/ferramentas.ts`: **porta de entrada**, junta os módulos.
- `lib/ia/ferramentas/base.ts`: tipos, `eventosVisiveis`, `exigirEvento`, `exigirSetor`, `exigirGestor`, `resolverSetor`, `resolverFuncionario`, `criarPedirConfirmacao` (trava de confirmação para exclusões). **Toda regra de acesso mora em código, nunca no prompt.**
- `ferramentas/consultas.ts`, `eventos.ts`, `funcionarios.ts`, `setores.ts`, `usuarios.ts`, `whatsapp.ts`.
- `lib/ia/auditoria.ts`: grava em `auditoria_ia` (só escrita, nunca consulta; nunca lança).
- UI: `components/ia/AssistenteIA.tsx` + `components/ia/historico.ts`.

---

## 4. BANCO DE DADOS (`supabase/`)

### Formato das migrations: atenção
- `supabase/migrations/` tem **1 arquivo só**: `20240101000000_init.sql` (idêntico a `schema.sql`).
- O modelo real está em **47 arquivos `upgrade-*.sql` + 2 `reparo-2026-08-01*.sql`** na raiz de `supabase/`, **sem prefixo de data e sem ordem numérica**. São rodados à mão no SQL Editor do dashboard; quase todos são idempotentes e vários trazem bloco `-- ROLLBACK` comentado. **Não existe ferramenta que garanta a ordem**, a ordem é descrita nos comentários de cabeçalho ("rodar DEPOIS de X").
- `supabase/config.toml` (408 l.): config do Supabase CLI; `supabase/restaurar-mensagens.mjs`, script Node que repõe dados de mensagens a partir de backup; `supabase/TEMPLATES-WHATSAPP.md`, os 7 templates da Meta (histórico; hoje o envio é texto livre pela Evolution).

### `schema.sql` (56 linhas: só o núcleo original)
`eventos`, `fornecedores`, `funcionarios`, `registros` + 4 índices, com **RLS desabilitado** (estado de 2024; hoje o lockdown inverteu isso).

### Modelo de dados consolidado

**`organizacoes`** (tenant): `id`, `nome`, `documento`, `responsavel_nome`, `limite_eventos` (default 1), `ativo`, `drive_folder_id`, `foto_perfil_path`, `valor_cobrado`, `valor_cobrado_periodo` (default `'mensal'`), `created_at`.

**`perfis`** (usuários do sistema; 1:1 com `auth.users`): **não existe CREATE TABLE neste repositório**: o cabeçalho de `upgrade-papeis-setores-qr.sql` cita um `create-perfis-schema.sql` que **não está versionado**. Colunas acrescentadas pelos upgrades: `organizacao_id` → `organizacoes`, `fornecedor_id` → `fornecedores` (o setor ABERTO agora), `telefone`, `ativo` (default true), `cpf` (índice único parcial), `acesso_expira_em`. `role` é um CHECK, evoluído em 4 migrations até `('master','admin','gerente','supervisor','cliente','operador_portao','suporte')`.

**`eventos`**: `id`, `nome`, `descricao`, `data_inicio`, `data_fim`, `local`, `ativo`, `created_at`, `organizacao_id`; janelas `janela_entrada_inicio/fim`, `janela_meio_inicio/fim`, `janela_fim_inicio/fim`; `token_portaria` (único parcial) + `portaria_ativa` (default false); `cadastro_suspenso`; `batida_livre`; `checkin_autonomo`; `exige_meio` (por dia); `tolerancia_qr_min` (default 15); `msg_pre_evento_envio`, `msg_pre_evento_instrucoes`.

**`fornecedores`** = **SETOR na linguagem da UI**: `id`, `evento_id`, `nome`, `email_contato`, `token_formulario` (único, default hex 16 bytes), `created_at`, `valor_combinado`, `cpfs_autorizados`, `link_ativo` (default true), `exige_meio` (default false).

**`setores`**: tabela criada em `upgrade-papeis-setores-qr.sql`, **praticamente vestigial**: no código só aparece em `criarSetor`/`deletarSetor` (`lib/actions.ts:2017` e `:2030`). `funcionarios.setor_id` aponta pra ela.

**`funcionarios`**: `id`, `fornecedor_id`, `nome`, `cpf` (indexado; guardado só com dígitos), `telefone`, `email`, `empresa`, `cargo`, `qr_token` (único), `created_at`, `setor_id`, `qr_expira_em`, `cidade` (índices por `lower(cidade)` e `lower(nome)`), `chave_pix`, `pago`+`pago_em`, `valor_receber` (default 0), `ativo` (default true), `consentimento_base`+`consentimento_em`, `foto_perfil_path`, `origem` (`portaria|formulario|planilha|admin`; nulo = anterior à coluna), `descredenciado_em`+`descredenciado_por`.

**`registros`** (batidas): `id`, `funcionario_id`, `evento_id`, `tipo`, `created_at`, `data_ref` (date), `jornada_dia_id`, `criado_por_perfil_id`, `endereco_aproximado`, `registro_manual`, `foto_url`, `latitude`, `longitude`, `dispositivo`, `justificativa`.
**CHECK de `tipo`: estado final: `('entrada','meio','fim')`** (restaurado por `reparo-2026-08-01.sql`). Índice único **`registros_unico_por_dia (funcionario_id, evento_id, tipo, data_ref)`**, a trava que substituiu o antigo delete+insert. Índice `registros_evento_dia_idx (evento_id, data_ref)`.

**`evento_jornadas`** (a REGRA, 1 por evento): `evento_id` (unique), `data_inicio`, `data_fim`, `tolerancia_min`, `blocos jsonb` (`[{dias:[1..5], turnos:[{entrada,saida}]}]`, `dias` segue `getDay()` do JS).
**`jornada_dias`** (cada TOQUE, = "dias de trabalho do evento"), `evento_id`, `jornada_id` (opcional), `data`, `turno`, `entrada_inicio/fim`, `saida_inicio/fim` (todos opcionais), `cancelado`, `tipo ∈ ('preparacao','principal')`. Unique `(evento_id, data, turno)` e unique parcial **um único dia `principal` por evento**.

**`supervisor_eventos`**: PK `(perfil_id, evento_id)`, modelo antigo.
**`supervisor_setores`**: PK `(perfil_id, fornecedor_id)`: a quais setores o supervisor PODE acessar (com backfill a partir de `perfis.fornecedor_id`).

**`suporte_escopo`**: `perfil_id`, `organizacao_id` XOR `evento_id` (constraint `suporte_escopo_um_alvo`).
**`alteracoes_cadastro`** (auditoria genérica): `usuario_responsavel` (texto, copiado no momento), `usuario_responsavel_id`, `organizacao_id`, `evento_id`, `funcionario_id`, `acao`, `campo_alterado`, `valor_anterior`, `valor_novo`, `motivo`, `ip`, `created_at`.
**`auditoria_ia`**: `perfil_id`, `perfil_nome`, `perfil_role` (copiados), `organizacao_id`, `acao`, `detalhes jsonb`, `origem` (default `'assistente_ia'`), `criado_em`.

**`permissoes_organizacao`**: `organizacao_id` (NULL = padrão da plataforma), `role`, `chave`, `permitido`, `atualizado_por`, `atualizado_em`. Unique por `(coalesce(organizacao_id, uuid-zero), role, chave)`.

**`avisos`**: `evento_id`, `titulo`, `mensagem`, `ativo`, `data_inicio`, `data_fim`, `publico ∈ ('todos','setores','pessoa','supervisores')`, `cpf_pessoa` (texto sem FK, porque CPF é a única chave que cruza `funcionarios` e `perfis`), `recorrente`, `criado_por`.
**`aviso_setores`**: PK `(aviso_id, fornecedor_id)`.
**`aviso_visualizacoes`**: `funcionario_id` XOR `perfil_id` (constraint + 2 uniques parciais).

**`veiculos`**: `evento_id`, `funcionario_id` (NOT NULL = o condutor, sempre alguém credenciado), `empresa`, `placa` (sem máscara, maiúscula; unique por `(evento_id, placa)`), `modelo`, `cor`, `tipo` (caminhao|van|carro|moto|outro), `observacoes`, `foto_path`, `criado_por_perfil_id`.
**`veiculo_dias`**: `(veiculo_id, data)` unique. **Sem nenhuma linha = autorizado em todos os dias.** Escopo deliberado: veículo NÃO bate ponto, não tem QR.

**`cpfs_bloqueados`**: `evento_id`, `fornecedor_id` (sempre NULL hoje, só origem), `cpf`, `motivo`, `bloqueado_por`. Unique com `coalesce` no fornecedor. Escopo é o EVENTO, nunca a plataforma.

**`mensagens_agendadas`** (fila): `evento_id`, `funcionario_id`, `perfil_id`, `tipo` (CHECK com os 10 tipos consolidados), `condicao`, `agendado_para`, `status ∈ ('pendente','enviando','enviado','falhou','cancelado')`, `tentativas`, `max_tentativas` (3), `proxima_tentativa`, `telefone`, `mensagem`, `evolution_message_id`, `erro`, `enviado_em`, `data_ref` (date, default '1970-01-01'). Uniques: `(evento_id, funcionario_id, tipo)`, `(perfil_id, tipo)` e, por dia, `mensagens_agendadas_func_dia_key` / `..._perfil_dia_key`.
**`mensagens_log`**: `mensagem_agendada_id`, `tentativa`, `status ∈ ('sucesso','erro')`, `status_http`, `resposta_evolution jsonb`, `erro`, `destinatario_telefone`, `tipo`, `criado_em`.

**`whatsapp_eventos`**: `direcao ∈ ('recebida','enviada','status')`, `wa_message_id`, `telefone`, `nome_contato`, `tipo`, `texto`, `ocorrido_em`, `bruto jsonb`, `criado_em`, `evento_id`, `funcionario_id`. Unique parcial de dedupe `(wa_message_id, direcao, tipo)`.

**`sistema_estado`**: chave/valor, uma linha por assunto, sobrescrita (último estado conhecido do WhatsApp; é o "sinal de vida" do worker).

**`leads`**: usada por `app/api/leads/route.ts`, **sem DDL no repositório** (não confirmei onde é criada).

### RLS
`upgrade-rls-lockdown.sql` liga RLS **sem criar nenhuma policy** em `organizacoes, perfis, eventos, fornecedores, funcionarios, registros, setores, supervisor_eventos`. Efeito: `anon` e `authenticated` não leem nem escrevem nada; **só a service role acessa**, e o isolamento por organização é feito no código do servidor. Migrations posteriores estendem o lockdown a `mensagens_agendadas`, `mensagens_log`, `whatsapp_eventos`, `sistema_estado`, `cpfs_bloqueados`, `permissoes_organizacao`, `auditoria_ia`, `evento_jornadas`, `jornada_dias`, `veiculos`, `veiculo_dias`, `suporte_escopo`, `alteracoes_cadastro` e, em `upgrade-suporte.sql`, fechando um gap, `avisos`, `aviso_setores`, `aviso_visualizacoes`, `supervisor_setores`.
**Não confirmei o estado final de `setores`/`supervisor_setores` no banco de produção**, porque `upgrade-supervisor-multi-setor.sql` faz `disable` e `upgrade-suporte.sql` (posterior) faz `enable`, a ordem manual decide.

### Functions / triggers
**Não existe nenhuma `CREATE FUNCTION` nem `CREATE TRIGGER` de aplicação nos SQLs.** Só blocos `DO $$` anônimos (renomeio de colunas no reparo, constraint condicional) e um `drop function if exists normalizar_nome(text)` removendo algo criado por engano. O claim atômico da fila é feito por `UPDATE ... WHERE status='pendente'`, explicitamente "sem função de banco".

### Storage
Um único bucket em uso: **`presencas`** (fotos de presença, foto de perfil do funcionário, foto da organização, foto do veículo), sempre por URL assinada.

---

## 5. WORKER (`worker/`)

- `worker/index.ts` (22 linhas): importa `processarFilaMensagens` de `../lib/mensagens`, roda `tick()` imediatamente e depois `setInterval` a cada **20 000 ms**. Loga só quando processou > 0. Nenhuma porta HTTP.
- `worker/package.json`: `credenciei-whatsapp-worker`, `start: tsx index.ts`, deps `@supabase/supabase-js` + `tsx`.
- `worker/Dockerfile`: `node:22-alpine`, **build context = RAIZ do repo**, copia `lib/` e `worker/`, `CMD npx tsx worker/index.ts`.
- `worker/README.md`: deploy em VPS via **EasyPanel** (Build Context = raiz, Dockerfile Path = `worker/Dockerfile`). Env obrigatórias listadas lá: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_URL`, `EVOLUTION_INSTANCIA`, `EVOLUTION_APIKEY`.

**Relação com o cron da Vercel:** `vercel.json` agenda `/api/cron/enviar-mensagens` com `* * * * *` (a cada minuto). Os dois chamam **exatamente a mesma função** `processarFilaMensagens()`, zero lógica duplicada. O worker é o processo principal (20s), a rota é o fallback redundante. A corrida entre os dois é segura: o claim é um `UPDATE` guardado por `status='pendente'`, e o Postgres serializa UPDATEs na mesma linha.
Interruptor de emergência comum aos dois: **`WHATSAPP_PAUSADO=true`** faz `processarFilaMensagens` retornar `{processadas:0}` na hora, sem redeploy.
Nota: o worker importa `lib/mensagens.ts` diretamente, mas `worker` está no `exclude` do `tsconfig.json` da raiz, mudanças em `lib/` não são type-checked contra o worker.

---

## 6. COMPONENTES E DESIGN SYSTEM

### Fonte
**Archivo** (Google Fonts, via `next/font/google`), pesos **400, 500, 600, 700, 800**, `display: swap`, exposta como `--font-archivo` (`app/layout.tsx`). Corpo em 400; títulos e números grandes em **800**, com `letter-spacing: -0.02em` (`h1..h4` em `globals.css:256`). O comentário no layout diz: "é o peso 800 que dá a cara de painel de arena". Nenhuma segunda família é carregada.

### Tema "Arena": `app/globals.css` (1169 linhas)
Estratégia central (documentada no topo do arquivo): em vez de reescrever ~90 arquivos que já usavam `text-slate-800`, `bg-white`, `bg-brand-50`, o CSS **redefine o que esses nomes valem**, `slate-*` vira a escala branco-sobre-escuro, `brand-*` vira o laranja, `bg-white` vira a superfície de vidro.

**Cores base (`:root`)**
- `--background: #0d0c0c` · `--foreground: #f3f2f2`
- Luzes do fundo: `radial-gradient` laranja `rgba(255,74,15,.14)` no canto superior esquerdo e `rgba(163,27,5,.18)` no inferior direito
- Vidro: `--vidro` = gradiente branco 7%→2%; `--vidro-suave` 5%→1.5%; **`--vidro-solido: #161515`**; `--vidro-borda: rgba(255,255,255,.10)`; `--vidro-borda-suave: rgba(255,255,255,.06)`
- Laranja: **`--laranja: #FF4A0F`**, `--laranja-claro: #FF8A4C`, `--laranja-escuro: #A31B05`, `--laranja-rotulo: #E8541A`
- `--gradiente-marca: linear-gradient(135deg, #A31B05 0%, #FF4A0F 60%, #FF8A4C 100%)`
- `--brilho-marca: 0 8px 28px rgba(255,74,15,.45), inset 0 1px 0 rgba(255,255,255,.25)`
- Gráficos: `--grafico-meio #f3f2f2`, `--grafico-fim #9b9797`, `--grafico-superficie #161515`, `--grafico-texto #f3f2f2`

**Tokens `@theme`**
- Neutros: `neutro-0 #0d0c0c`, `neutro-25 #111010`, 50–300 em branco transparente (4%/7%/10%/18%), 400–700 em `#f3f2f2` com alpha (45/60/72/85%), `neutro-800 #f3f2f2`, `neutro-900/950 #ffffff`
- Acento: `acento-500 #FF4A0F`, `acento-600 #E33C06`, `acento-700 #A31B05`; `--color-marca: #FF4A0F`
- Status: sucesso `#22c55e`/`#7ee2a8`, aviso `#f59e0b`/`#fcd27a`, erro `#f05252`/`#fca5a5`, info `#60a5fa`/`#93c5fd`
- `brand-300 #FFB08F`, `brand-400 #FF8A4C`, `brand-500 #FF4A0F`, `brand-600 #E33C06`, `brand-700 #A31B05`
- As cores cruas do Tailwind (`red/amber/green/blue`) também são redefinidas para o mesmo contrato.

**Classes de componente** (`@layer components`): `.btn` + `.btn-sm/-lg/-icone/-icone-lg/-icone-campo`, `.btn-primario` (gradiente + brilho), `.btn-secundario` (vidro), `.btn-perigo`, `.btn-fantasma`, `.btn-acento` (laranja vazado), `.btn-press`; `.input`, `.linha-acao`; `.topo-app`, `.pilula-contexto`, `.avatar-anel`, `.menu-lateral`, `.menu-item`, `.menu-item-ativo`, `.menu-item-ia`; `.secao` + tons `.secao-destaque/-acento/-info/-sucesso/-aviso` + `.secao-icone`; `.evento-vivo` (com `@keyframes neon`/`aura` e `.ponto-vivo`); `.chip-contexto`, `.pagina-titulo`, `.pagina-descricao`; `.indicador` (KPI, com fio de luz `::after`) e variantes `-acento/-info/-sucesso/-aviso/-erro`, `.indicador-selo` + `.selo-sucesso/-aviso/-erro/-neutro/-acento`; `.tabela`; `.abas`/`.aba`/`.aba-ativa`/`.aba-contador`; animações `drawer-slide-in`, `overlay-fade-in`, `modal-pop-in`, `tutorial-spotlight`, `.animate-scan`/`.animate-cut`, `.barra-entrada`, `.donut-fatia`, `.neon-line`. Cantos 10–20 px. Foco por teclado = anel laranja em todo o sistema; `::selection` = `rgba(255,74,15,.35)`.
- `@media print`: só `.cracha-impressao` fica visível (crachá/cartaz), com texto forçado a `#141414`.
- **Tema claro**: `html[data-tema="claro"]` (a partir da linha ~969) redefine neutros para preto-sobre-claro (`#201e1d`, `#111010`, `rgba(32,30,29,…)`), superfícies brancas, acento em texto `#DD2B0F`. Aplicado por um `<Script strategy="beforeInteractive">` no `layout.tsx` (evita piscar) e controlado por `components/Tema.tsx` (`CHAVE_TEMA = 'credenciei-tema'`, valores `'escuro' | 'claro'`). **Landing, login e telas públicas são sempre escuras**, não leem `data-tema`.
- Utilitários `.so-escuro` / `.so-claro` usados no `AppShell` para trocar `logo-branco.png` ↔ `logo-preto.png`.

### Brandbook: `app/Template Marca/Credenciei brand presentation.pdf` (Brandbook v1.0, 2026)
Paleta oficial (página 17):
- **Laranja Credenciei `#FF4A0F`** (RGB 255·74·15)
- **Preto `#141414`** (RGB 20·20·20)
- **Branco `#F3F2F2`** (RGB 243·242·242)
- **Prata `#C9C9C9`** (RGB 201·201·201)
- **Gradiente: `#2B0402 → #A31B05 → #E8541A → #E9C58A`**
Proporção de uso 60 (branco/prata) · 30 (preto) · 10 (laranja). Área de proteção = x/4. Tamanho mínimo: símbolo 24 px / logotipo 120 px em tela; 8 mm / 35 mm impresso. Símbolo = três vetores convergindo (quem organiza, quem trabalha, quem controla o acesso). Credencial impressa: **86 × 125 mm vertical**, nome em destaque, função em laranja, QR no rodapé, cor por função (Staff · Produção · Imprensa · Fornecedor).
Observação: a paleta do brandbook (`#141414`, `#F3F2F2`) e a do app (`#0d0c0c`, `#f3f2f2`) **não são idênticas** no preto. Não encontrei página de tipografia no PDF nas páginas que li (1-8, 11-20), a escolha de Archivo está documentada no código, não no brandbook.

### Componentes reutilizáveis (`components/`, 27 arquivos)
- **Moldura**: `AppShell.tsx` (486 l.): topo com marca › contexto, menu lateral em 3 grupos, gaveta mobile, menu do usuário, botão do assistente, `TutorialUsuarioProvider`, `AssistenteIAProvider`. `MeusSetores.tsx` (troca de setor do supervisor).
- **UI base** (`components/ui/`): `Superficie.tsx` (`Secao`, `Cartao`, `CartaoLink`, `PageHeader`, `EmptyState`, `Badge`, `Aviso`, tipos `TomSecao`/`TomBadge`), `Botao.tsx` (`Botao`, `BotaoLink`, `classesBotao`; variantes `primario|secundario|perigo|fantasma`, tamanhos `sm|md|lg|icone|icone-lg`), `MenuAcoes.tsx` (`MenuAcoes`, `ItemMenu`), `animated-scan-loader.tsx`, `modern-stunning-sign-in.tsx` (a tela de login).
- **Formulário**: `inputs.tsx` (`NomeInput`, `CpfInput`, `CpfCnpjInput`, `TelefoneInput`, `useCampoFormatado`), `DateTimePicker.tsx`, `SeletorDeDia.tsx`, `SeletorDePeriodo.tsx`, `SeletorLista.tsx`, `ValorCobradoPicker.tsx`.
- **Dados**: `StatCard.tsx`, `charts.tsx` (`COR_ETAPA`, `BarrasMagnitude`, `ProgressoEtapas`, `DistribuicaoEtapas`, `DonutComposicao`) + `charts-cliente.tsx` (wrapper client do Recharts), `HistoricoBatidas.tsx`.
- **Overlays**: `ConfirmModal.tsx`, `LoadingOverlay.tsx`, `AvisoExibicaoModal.tsx`.
- **Tutorial guiado**: `tutorial/TutorialProvider.tsx`, `TutorialOverlay.tsx`, `TutorialButton.tsx`, `types.ts`. Cada tela define um `TutorialConfig` com `tela`, `versao` e `passos`, subir a `versao` faz quem já viu ver o roteiro novo.
- **IA**: `ia/AssistenteIA.tsx` (508 l., `useAssistente`, `AssistenteIAProvider`, `CartaoConfirmacao`), `ia/historico.ts`.
- **Tema**: `Tema.tsx` (`lerTema`, `aplicarTema`, `useTema`, `BotaoTema`).
- Assets: `public/marca/`: `logo-branco.png`, `logo-preto.png`, `iso-laranja.png`, `iso-branca.png`, `iso-preta.png`, `iso-3d.png`. Ícones do App Router: `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png` (gerados quadrados a partir de `iso-laranja.png`, `metadata.icons` é omitido de propósito).

---

## 7. TESTES (`testes/`)

Único arquivo: **`testes/coerencia.mjs`** (5.5 KB), rodado por `npm run coerencia`. Não é teste unitário, é uma **auditoria de coerência entre a REGRA no código e o TEXTO que o sistema diz**. Sem dependências: lê 9 arquivos com `readFileSync` e aplica regex, contando falhas e saindo com `process.exitCode = 1`.

Arquivos monitorados: `proxy.ts`, `lib/janelas.ts`, `lib/actions.ts`, `lib/credencial-qr.ts`, `lib/mensagens.ts`, `lib/mensagens-modelos.ts`, `app/credential/[token]/page.tsx`, `.../QrProtegido.tsx`, `.../CheckinPresenca.tsx`.

Os 8 grupos validados:
1. **O QR muda por ETAPA, não por dia**: `gerarCodigoQR` assina `fase: FaseDoDia`; nenhum texto diz "muda todo dia"; a tela do QR fala em etapa.
2. **A regra das 4h é informação de ADMIN**: nem a prévia da mensagem, nem a recusa do meio, nem a credencial contam a conta das 4 horas.
3. **O meio ABRE e nunca FECHA**: o servidor só barra antes de abrir; a credencial mantém o cartão aberto e mostra `avisoAtraso`.
4. **A saída NÃO exige mais o meio**: nem o servidor bloqueia nem a mensagem afirma isso.
5. **Batida livre solta o HORÁRIO, não o CALENDÁRIO**: dia não marcado e dia cancelado são checados ANTES de `batida_livre === true` (valida inclusive a ORDEM no arquivo), e `diaComTrava` cala lembrete/reforço.
6. **Toda tela sem login está liberada no proxy**: confere literalmente `pathname.startsWith('/form/' | '/credential/' | '/portaria/' | '/supervisor/criar-senha/')`.
7. **Montagem tem entrada e saída livres**: `if (dia.tipo !== 'principal') return { ok: true }`; nada é cobrado sem horário esperado.
8. **No dia principal, registro livre exige `checkin_autonomo`**, tela e servidor, os dois.

O cabeçalho do arquivo documenta os 3 incidentes reais que motivaram a existência dele. **É o único teste automatizado do projeto**, não há Jest/Vitest/Playwright.

---

## 8. ESCOPO DO SISTEMA (`Escopo Do sistema/`)

Um único arquivo: **`CREDENCIEI Guias de Processo.docx`** (361 KB). **A pasta está no `.gitignore`** ("Referencia local do agente, nao faz parte do app"), é material de processo, não de código. Contém 4 seções:

1. **Passo a passo comercial: venda do CREDENCIEI**: prospecção/qualificação (produtoras, agências de ativação, feiras e congressos; qualificar por volume de freelancers/evento e frequência); demonstração (enviar vídeo de 1 min no WhatsApp antes da call); diagnóstico da dor (tempo do credenciamento manual, fraude, controle de entrada/saída); proposta comercial (tabela de preços marcada como `[inserir]`; assinatura mensal para casa de show/bar, precificação avulsa para shows; débito automático ou crédito recorrente); tratamento de objeções (`[inserir argumentário validado pelo jurídico]`); fechamento; handoff para onboarding.
2. **Onboarding do cliente**: kickoff; definição e **treinamento do "gestor operacional de credenciamento"** (a pessoa que gera e envia os links e conduz o check-in no dia); explicação do fluxo para os freelancers; configuração do evento (setores/funções + janelas de credenciamento, check-in e descredenciamento); **simulação com grupo pequeno antes do evento**; suporte no dia; relatório pós-evento + feedback.
3. **Passo a passo do freelancer**: recebe link de cadastro → preenche (CPF autopreenche cadastros recorrentes; foto opcional) → mensagem de saudação + QR no WhatsApp → lembrete no dia → credenciamento no local com o QR → check-in no meio, por **foto com geolocalização** → descredenciamento ao final. Cita também a importação por planilha, mas recomenda o autocadastro.
4. **Criações** (material a produzir): Regras de Credenciamento · Manual do Fornecedor · Segurança do Trabalho / Orientações.

**Divergências entre o docx e o código de hoje** (importante para não usar o docx como spec):
- O docx diz que o lembrete sai "2 horas antes do início do credenciamento"; o código usa **horário fixo 07:00** (`HORA_AVISO_DIA_EVENTO`), caindo para "2h antes" só quando a janela inteira fecha antes disso.
- O docx descreve o check-in do meio como **sorteado sem aviso prévio**; o código usa **entrada real + 4h**, com janela de 2h.
- O docx manda o freelancer "procurar seu supervisor"; o sistema hoje fala em **posto de credenciamento** (o supervisor foi explicitamente removido de `podeEscanear`).

---

## 9. RISCOS E ARMADILHAS

**9.0: O aviso do `AGENTS.md` (vale para toda tarefa)**
`AGENTS.md` (referenciado por `CLAUDE.md` via `@AGENTS.md`) diz, literalmente:
> **"This is NOT the Next.js you know.** This version has breaking changes, APIs, conventions, and file structure may all differ from your training data. **Read the relevant guide in `node_modules/next/dist/docs/` before writing any code.** Heed deprecation notices."
Isso é Next **16.2.9**. Sinal concreto no repo: o middleware se chama **`proxy.ts`** e exporta `proxy()`, não `middleware.ts`/`middleware()`. `after()` é importado de `next/server`. Params e searchParams são `Promise` e sempre `await`ados. **Neste checkout `node_modules` não está instalado**, o agente precisa rodar `npm install` antes de conseguir ler esses docs.

**9.1: `setor` ≠ tabela `setores`.** Na UI, "setor" é a tabela **`fornecedores`**. A tabela `setores` existe e só é tocada por `criarSetor`/`deletarSetor`; `funcionarios.setor_id` aponta pra ela. Confundir as duas quebra escopo de supervisor, links de cadastro e relatórios.

**9.2: Tipos desatualizados em `lib/supabase.ts`.** `Registro.tipo` está tipado como `'entrada' | 'saida' | 'conferencia'`, mas o CHECK atual do banco é **`('entrada','meio','fim')`** (restaurado em `reparo-2026-08-01.sql`). `Funcionario`/`Evento` também não têm dezenas de colunas que existem hoje. Não use esses tipos como fonte de verdade.

**9.3: Migrations sem ordem garantida.** 47 `upgrade-*.sql` sem prefixo temporal, aplicados à mão no dashboard. Não há histórico de aplicação nem `supabase db push` funcional. Um arquivo pode já estar aplicado, parcialmente aplicado ou nunca ter rodado, o código é escrito para ser **tolerante a migração ausente** em vários pontos (`excecoesDePermissao`, `meusSetores`). Quebrar essa tolerância derruba o sistema no meio de um evento.

**9.4: `perfis` não tem DDL no repositório.** O `create-perfis-schema.sql` citado em `upgrade-papeis-setores-qr.sql` não existe aqui. Recriar o banco do zero a partir deste repo **não funciona**.

**9.5: O incidente de 31/07/2026 está documentado em `reparo-2026-08-01.sql`.** Migrations foram escritas contra uma cópia ANTIGA do projeto e rodadas no Supabase de produção: renomearam 6 colunas `janela_*` (60 usos no código), trocaram os valores de `registros.tipo` (99 usos) e **dropparam `mensagens_agendadas` e `mensagens_log`**. Lição registrada no próprio arquivo: confirme contra qual checkout a migration foi escrita.

**9.6: RLS ligado sem policies.** Qualquer código novo que tente usar a chave `anon` para ler/escrever tabelas de negócio **falha silenciosamente com zero linhas**. Tudo tem que passar por `supabaseAdmin` no servidor, e o isolamento por `organizacao_id` é responsabilidade do código, não do banco. Esquecer um filtro de organização é vazamento entre clientes.

**9.7: As rotas `/api/*` não passam pelo proxy** (`matcher` exclui `api/`). Toda nova rota de API precisa chamar `getPerfil()` e checar permissão por conta própria. O repositório tem três correções documentadas exatamente desse erro: `api/drive-cleanup` (nasceu como GET sem auth e apagava as planilhas de todas as organizações), `api/sheets/funcionario` e `api/sheets/registro` (aceitavam qualquer id e escreviam na planilha de qualquer cliente).

**9.8: Rotas públicas: esquecer uma no `proxy.ts` não dá erro em dev.** Dá redirect pro login em produção, e quem está do outro lado conclui que o sistema quebrou. Já aconteceu com `/portaria/`. O grupo 6 do `coerencia.mjs` existe por isso, **rode `npm run coerencia` antes de subir**.

**9.9: `app/api/auth/google/callback` escreve em `.env.local` com `fs.writeFileSync`.** Só funciona localmente; na Vercel o filesystem é read-only. **A falta de autenticação foi corrigida em 20/09/2026**: as duas rotas do OAuth do Google (`authorize` e `callback`) agora exigem sessão de master. Sem isso, qualquer pessoa completava o fluxo e apontava `GOOGLE_REFRESH_TOKEN` para o Drive dela, que é onde ficam as planilhas com nome, CPF, telefone e chave PIX das equipes.

**9.10: `/api/leads` é pública, usa service role e insere numa tabela (`leads`) que não existe em nenhum SQL deste repo.** Desde 20/09/2026 tem teto de envios (5 por IP a cada 10 min, 200/h no geral, `lib/limite.ts`), mas continua **sem captcha e sem verificação de origem**, e a pasta segue **untracked no git**.

**9.11: WhatsApp: risco de banimento é real e histórico.** O número já foi **banido uma vez** (Evolution) e **restrito outra** (51 mensagens num dia). Por isso existem: espaçamento aleatório entre envios, pacing 1–2 s, `ATRASO_MAXIMO_MIN = 180` (mensagem mais velha que 3h é cancelada, não enviada, para não disparar tudo de uma vez após uma queda), checagem de instância conectada antes de reivindicar o lote, e `WHATSAPP_PAUSADO`. Mexer nessa parte sem entender a motivação recria o banimento.

**9.12: `NEXT_PUBLIC_SITE_URL`.** Usada em 8 lugares, todos com fallback `'https://credenciei.vercel.app'` (exceto `lib/url.ts`, que existe justamente para corrigir o fallback antigo `localhost:3000`). `lib/mensagens.ts:194` cancela o envio se a URL não for `https`, porque a variável já esteve apontando errado.

**9.13: `CREDENCIAL_SEGREDO` e `CRON_SECRET` são usadas no código mas NÃO estão em `.env.local`.** Consequências: o QR é assinado com a `SUPABASE_SERVICE_ROLE_KEY` (fallback documentado, **rotacionar a service key invalida todos os QR em circulação na hora**), e `/api/cron/enviar-mensagens` responde **401 sempre** enquanto `CRON_SECRET` não existir, ou seja, o fallback do Vercel Cron pode estar inoperante. Não confirmei o estado das variáveis na Vercel.

**9.14: `ADMIN_EMAIL` está em `.env.local` e não aparece em nenhum lugar do código.** Provavelmente morta.

**9.15: Teto de 1000 linhas do PostgREST.** `.limit(20000)` **não funciona**; o Supabase corta em `db.max_rows`. Use `buscarTudo()` (`lib/supabase-server.ts`) quando precisar das linhas, ou `{count:'exact', head:true}` quando só precisar contar. Já causou "1000 fixo" no Painel e em equipes com >1000 pessoas.

**9.16: `supervisor_setores` vs `perfis.fornecedor_id`.** São 29 lugares no código comparando `perfil.fornecedor_id === algo`, e **todos são checagem de permissão**. `fornecedor_id` = o setor aberto AGORA; `supervisor_setores` = os que ele pode abrir. Trocar um pelo outro abre acesso a setor de outro cliente ou tranca o supervisor no meio do evento.

**9.17: `app/Template Marca/` é uma pasta com espaço no nome dentro do App Router**, contendo só um PDF de 3,4 MB. Não gera rota (não tem `page.tsx`), mas é um asset pesado num lugar não convencional.

**9.18: `lib/actions.ts` com 6161 linhas** e `'use server'` no topo: **cada função exportada vira um endpoint público**. O comentário em `lib/relatorios.ts` registra que isso já causou um achado de segurança. Toda função exportada num arquivo `'use server'` precisa checar permissão logo na primeira linha, sem confiar em quem chamou.

**9.19: `worker/` está no `exclude` do `tsconfig.json`.** Mudanças em `lib/mensagens.ts` não são validadas contra o worker, e o worker tem `package.json` próprio (só `@supabase/supabase-js` + `tsx`), importar qualquer coisa nova em `lib/mensagens.ts` que dependa do Next quebra o worker em runtime na VPS, não no build.

**9.20: `next.config.ts` tem `allowedDevOrigins: ['192.168.15.123']`**, IP de rede local de uma máquina específica. Inofensivo, mas é configuração pessoal versionada.

**9.21: `@deprecated podeExcluirEventos`** (`lib/permissions.ts:115`) é alias de `podeExcluir` e ainda é chamado em telas (`app/admin/page.tsx`).

**9.22: Papéis legados `gerente` e `cliente`** continuam válidos no CHECK e nas funções de permissão, mas não aparecem na UI nem em `PAPEIS_CONFIGURAVEIS`. Contas antigas com esses papéis existem; removê-los do código tranca essas pessoas fora.

**9.23: Documentação desatualizada no repo.** `README.md` é o boilerplate do `create-next-app` (fala em Geist, que não é a fonte usada). `SETUP.md` manda colar `supabase/schema.sql` no SQL Editor, o que cria **apenas 4 tabelas do modelo de 2024**, sem `perfis`, sem organizações, sem nada dos 47 upgrades.

**9.24: Duas colunas `exige_meio`** (uma em `eventos`, uma em `fornecedores`) e dois arquivos de upgrade para elas (`upgrade-meio-por-dia.sql`, `upgrade-meio-por-setor.sql`), com defaults opostos (`true` no evento, `false` no setor). Ler a errada inverte o comportamento.

**9.25: Dois arquivos criam `sistema_estado`** (`upgrade-saude-sistema.sql` e `upgrade-painel-whatsapp.sql`), ambos com `if not exists`, confirme qual definição está de fato no banco antes de assumir colunas.

**9.26: LGPD, o que a auditoria de 20/09/2026 encontrou (e não corrigiu, porque não é decisão de código).**
- **Não existe política de privacidade nem aviso de coleta** em rota nenhuma (`grep` por "privacidade"/"LGPD" só acha comentário e o aceite da base regional). O formulário público (`app/form/[token]/FormularioFuncionario.tsx`) não diz quem é o controlador, para que serve o dado, com quem é compartilhado nem como pedir exclusão.
- **O aceite da base regional é obrigatório pra trabalhar**: `disabled={loading || !consentimento}` na tela e `if (dados.consentimento !== true) return {error}` em `lib/actions.ts:4441`. Consentimento amarrado à prestação do serviço não é livre (LGPD art. 8 §4).
- **O reaproveitamento entre organizações ignora `consentimento_base`**: `buscarCadastroPorCpf` (`lib/actions.ts:4538`, caminho da base central) e `lib/importacao.ts:168-189` copiam telefone, cargo, cidade e **chave PIX** do cadastro de um cliente para o de outro.
- **Não existe rotina de retenção nem de expurgo** em nenhum SQL ou job: evento encerrado guarda selfie, GPS e CPF para sempre.
- **Exclusão é incompleta**: `deletarFuncionario` (`lib/actions.ts:2537`) apaga a linha, mas não os objetos do bucket `presencas` (avatar e selfies do meio), nem a linha na planilha do Google, nem o telefone em `mensagens_agendadas`/`mensagens_log`/`whatsapp_eventos`, nem nome e CPF gravados em texto na auditoria.
- **Coletado e nunca lido**: `registros.dispositivo` (user agent inteiro, gravado em `lib/actions.ts:5140`) e a tabela `cliques_whatsapp` (`app/wa/route.ts:50`, user agent + referer) só recebem escrita.
- Sem tracker de terceiro em lugar nenhum (nenhum pixel, GA, GTM ou Clarity), sem CORS aberto, sem segredo em variável `NEXT_PUBLIC_*`, todos os buckets privados e RLS ligada em todas as tabelas dos SQLs do repositório: esse lado está bem.

**9.27: Auditoria de segurança de 24/11/2026 (relatório completo em `projetos/credenciei/2026-11-24-auditoria-14-ataques.md` no cofre).** Regras que passaram a valer e que código novo tem que respeitar:
- **Link de "criar senha" de conta que JÁ EXISTE nunca vai pro telefone digitado num formulário.** Achar a conta pelo CPF e mandar o convite pro número que o gestor digitou era tomada de conta (supervisor de outra organização, operador, encarregado, até master pelo fluxo de Encarregado). Conta de outra organização só ganha o vínculo; aviso e link vão pro telefone que já estava nela (`criarSupervisorOuLanca`, `criarOperadorPortariaOuLanca`, `salvarEncarregado`, `gerarLinkNovaSenhaEncarregado`).
- **`exigirAcessoFuncionarios` amarra setor ao evento** e `exigirFuncionarioDoSetor` amarra pessoa ao setor e ao evento. Ação nova que recebe `funcionarioId`/`fornecedorId`/`eventoId` passa pelos dois.
- **Login (`/api/auth/login`) tem teto de senha errada**: 10 por conta e 50 por IP em 15 min (`aindaTemTentativa` + `podePassar` em `lib/limite.ts`, conta só falha). Sem `UPSTASH_REDIS_REST_URL`/`TOKEN` na Vercel o teto é por instância.
- **Totem nasce com senha aleatória** (não mais igual ao login).
- **Portaria por CPF (`identificarNaPortaria`) recebe o TOKEN do cartaz**, não o id do evento, e respeita `portaria_ativa`.
- **`buscarCadastroPorCpf`** só consulta com setor existente e tem teto por IP (20/h); o formulário público só devolve a credencial existente para quem digita o mesmo WhatsApp da ficha.
- **Assistente de IA**: `eventosVisiveis` só devolve evento para master/admin/gerente/cliente/supervisor; `exigirGestor` é lista branca; `excluir_setor` e `excluir_usuario` são só do master.

---

## 10. VARIÁVEIS DE AMBIENTE (apenas os NOMES)

### Em `.env.local` (22 nomes)
```
ADMIN_EMAIL
EVOLUTION_APIKEY
EVOLUTION_INSTANCIA
EVOLUTION_URL
GEMINI_API_KEY
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
GOOGLE_PRIVATE_KEY
GOOGLE_REFRESH_TOKEN
GOOGLE_SERVICE_ACCOUNT_EMAIL
META_APP_SECRET
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_PAUSADO
WHATSAPP_PHONE_ID
WHATSAPP_PROVEDOR
WHATSAPP_TOKEN
WHATSAPP_VERIFY_TOKEN
```

### Referenciadas no código via `process.env` (23 nomes)
As 22 acima **menos `ADMIN_EMAIL`** (que não aparece em nenhum `.ts`/`.tsx`/`.mjs`), **mais** duas que existem só no código:
```
CREDENCIAL_SEGREDO     (lib/credencial-qr.ts: opcional; sem ela, cai em SUPABASE_SERVICE_ROLE_KEY)
CRON_SECRET            (app/api/cron/enviar-mensagens/route.ts, obrigatória; sem ela a rota é 401 sempre)
```

### Onde cada grupo é consumido
- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (proxy, cliente SSR, `createBrowserClient` no AppShell), `SUPABASE_SERVICE_ROLE_KEY` (`supabaseAdmin`, worker, webhook, `/api/leads`, e como segredo de assinatura do QR).
- **Site**: `NEXT_PUBLIC_SITE_URL`.
- **Cron**: `CRON_SECRET`.
- **Credencial**: `CREDENCIAL_SEGREDO`.
- **WhatsApp Meta**: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`.
- **WhatsApp Evolution**: `EVOLUTION_URL`, `EVOLUTION_INSTANCIA`, `EVOLUTION_APIKEY`.
- **Chaves de controle do canal**: `WHATSAPP_PROVEDOR` (`meta`|`evolution`), `WHATSAPP_PAUSADO` (`true` pausa toda a fila).
- **Google**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (com `.replace(/\\n/g,'\n')`).
- **IA**: `GEMINI_API_KEY`.

Nenhum valor de segredo foi lido, copiado ou transportado: só os nomes das chaves.

---

## APÊNDICE: Convenções de código observadas

- **Tudo em português**: nomes de função, variáveis, tipos, comentários. `criarEvento`, `podeEscanear`, `janelaDoMeio`, `Superficie`, `Botao`.
- **Comentários como documentação de decisão**: praticamente todo arquivo abre com um bloco explicando *por que* aquilo existe, frequentemente citando a data e a pessoa que pediu ("decisão do Juan, 03/09/2026", "pedido de Henrique e Juliano, Kleber Andrade"). Esses blocos são a melhor fonte de contexto do repositório e devem ser preservados e atualizados junto com o código.
- Server components por padrão; `'use client'` só onde há interação. Muitas rotas declaram `export const revalidate = 0`.
- `loading.tsx` existe em ~10 rotas do admin.
- Mensagens de commit em português, no formato `feat:` / `fix:` com a frase escrita do ponto de vista do usuário (ex.: `fix: "Apagar mesmo assim" recusava em silêncio sem o motivo`).
