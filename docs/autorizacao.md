# Revisão de autorização do Credenciei

> **Status: FUNDAÇÃO PRONTA, NÃO LIGADA.** — 10/09/2026
>
> Existe o módulo (`lib/autorizacao-matriz.ts` + `lib/autorizacao.ts`) e o
> teste (`npm run autorizacao`). **Nenhuma tela ou Server Action usa isso
> ainda** — impacto de runtime zero. Ligar é o trabalho das fases abaixo, a
> ser feito **numa janela sem evento ao vivo**, cada fase testada em preview.

---

## Por que existe

As regras de "quem pode o quê" estavam em três lugares que se contradiziam:

1. `lib/permissions.ts` — ~15 funções `capacidade()` (a dimensão de **papel**)
2. ~20 helpers `exigir*` espalhados por `lib/actions.ts` (a dimensão de **escopo**: evento/setor)
3. `components/AppShell.tsx` `gruposPara()` — as condições do **menu**

O banco é lockdown total (`upgrade-rls-lockdown.sql`: RLS ligado, zero
políticas, só service role — que **ignora** RLS). Logo, **a barreira real é o
código do servidor**. Toda action e todo RSC precisa checar papel **e**
escopo; senão o menu é a única proteção, e menu não é segurança.

## A arquitetura

| Arquivo | Papel |
|---|---|
| `lib/autorizacao-matriz.ts` | **Puro.** A `MATRIZ` (ação → papéis + escopo + chave legada) e `temAcaoPeloPapel()` (papel + overrides). Sem banco. Testável. |
| `lib/autorizacao.ts` | **Cola com o banco.** `alcancaEvento()` / `alcancaSetor()` (a dimensão de escopo) e `exigirAcesso(acao, { eventoId?, setorId? })` — o guard que toda action chama no topo. |
| `testes/autorizacao.mjs` | `npm run autorizacao` — cobre a dimensão de papel e os overrides. Escopo é integração (por fase). |

As 3 camadas de decisão, da mais forte pra mais fraca:

```
override do ACESSO   (perfis.permissoes_usuario[chaveLegada])
override da ORG      (permissoes_organizacao → perfil.permissoes["role:chaveLegada"])
a MATRIZ            (regra.papeis inclui o papel?)
```

`master` curto-circuita tudo e sempre passa.

## A matriz alvo (decisões de 10/09/2026)

- **Admin continua por ORGANIZAÇÃO** — vê todos os eventos dela. (Decisão B; não há vínculo admin↔evento.)
- **Admin perde Gastos e o financeiro do WhatsApp.**
- **"Gestor de Credenciamento" = `operador_portao` elevado**: ganha criar setor + atribuir supervisor, no evento dele.
- **Supervisor** ganha Auditoria (só do próprio setor).
- **Suporte** ganha WhatsApp + Auditoria do evento + Encontro de Colaborador (**só consulta** — a tela some os botões de ação).

`●` tem · `S` limitado ao próprio setor · `E` executa mas o efeito é o evento inteiro · `○` só consulta

| Ação | Master | Admin | Supervisor | Gestor (operador) | Suporte |
|---|:--:|:--:|:--:|:--:|:--:|
| ver_todos_eventos | ● | | | | |
| gerenciar_organizacoes | ● | | | | |
| gerenciar_acessos | ● | ● | | | |
| gerenciar_permissoes | ● | | | | |
| gerenciar_backlog | ● | | | | |
| financeiro | ● | | | | |
| registrar_gastos | ● | | | | |
| base_funcionarios | ● | | | | |
| excluir | ● | | | | |
| whatsapp | ● | | | | ● |
| ver_painel | ● | ● | | | ● |
| escanear | ● | ● | | ● | ● |
| editar_evento | ● | ● | | | ● |
| editar_colaborador | ● | ● | S | | ● |
| gestor_credenciamento | ● | ● | | | ● |
| criar_setor | ● | ● | | ● | ● |
| atribuir_supervisor | ● | ● | | ● | ● |
| cadastrar_veiculo | ● | ● | | ● | ● |
| registro_ponto | ● | ● | S | ● | ● |
| atividades_evento | ● | ● | | | ● |
| avisos | ● | ● | S | | ● |
| lancamento_manual | ● | ● | S | ● | ● |
| bloquear_cpf | ● | ● | ● (efeito E) | ● | ● |
| relatorios | ● | ● | S | | ● |
| auditoria | ● | ● | S | | E |
| encontro_colaborador | ● | ● | | | ○ |

## Plano de execução — fases

Cada fase = branch própria → deploy em preview → teste por perfil + teste de
bypass (chamar a Server Action direto, abrir `?evento=` de outro evento) →
merge.

### Fase 0 — ligar o guard SEM mudar comportamento

Objetivo: `exigirAcesso` no topo de **toda** Server Action e RSC, com a
`MATRIZ` **ajustada pra bater exatamente com o que o sistema faz hoje** (não
com o alvo ainda). Passo que "toca tudo" mas não deve mudar nada.

Checklist das ~108 Server Actions (auditar uma a uma — tem/não tem checagem de escopo hoje):

- [ ] `lib/actions.ts` — eventos: `criarEvento`, `editarEvento`, `toggleAtivoEvento`, `deletarEvento`, `atribuirEventoAOrganizacao`, `salvarDiasDeTrabalho`, `obterConfiguracaoDoMeio`, `alternarPortaria`, `alternarCadastroPorLink`, `trocarTokenDaPortaria`, `criarLinkCadastroIndividual`, `alternarLinkDoSetor`
- [ ] `lib/actions.ts` — setores/fornecedores: `criarFornecedor`, `editarFornecedor`, `deletarFornecedor`
- [ ] `lib/actions.ts` — pessoas: `criarFuncionario`, `atribuirColaboradorAoEvento`, `deletarFuncionario`, `atualizarValorReceber`, `alternarPagamento`, `trocarSetorAtivo`, `alternarAtivacao`, `recredenciarFuncionario`, `sincronizarFuncionarioNaPlanilha`
- [ ] `lib/actions.ts` — acessos: `criarSupervisor`, `criarOperadorPortaria`, `criarSuporte`, `editarSuporte`, `adicionarAdmin`, `editarUsuario`, `alternarAtivoUsuario`, `redefinirSenha`, `deletarUsuario`, `criarOrganizacao`
- [ ] `lib/actions.ts` — operação: `registrarPresencaQR`, `conferirCredenciamentoPorCpf`, `bloquearCpf`, `desbloquearCpf`, `lancarPontoManual`, `corrigirCpf`
- [ ] `lib/actions.ts` — avisos: `criarAviso`, `editarAviso`, `alternarAtivoAviso`, `excluirAviso`, `visualizarAvisoSupervisor`, `obterVisualizacoesDoAviso`
- [ ] `lib/actions.ts` — veículos: `cadastrarVeiculo`, `atualizarFotoVeiculo`, `urlFotoVeiculo`, `excluirVeiculo`
- [ ] `lib/actions.ts` — leitura: `obterAuditoria`, `obterDadosRelatorio*`, `situacaoDoAcesso`
- [ ] `lib/actions-financeiro.ts` (6) — todas master hoje
- [ ] `lib/actions-gastos.ts` (4)
- [ ] `lib/actions-whatsapp.ts` (5)
- [ ] `lib/actions-backlog.ts` (13) — todas `podeGerenciarBacklog` (master)
- [ ] RSC: cada `app/admin/**/page.tsx` e `layout.tsx` — recheca escopo do `?evento=`?

### Fase 1 — virar a matriz pro alvo

- [ ] Supervisor → Auditoria do setor (`obterAuditoria` aceitar supervisor com filtro por setor)
- [ ] Suporte → WhatsApp (tirar o `ehMaster` de `app/admin/whatsapp/layout.tsx`, pôr `exigirAcesso('whatsapp')`)
- [ ] Suporte → Auditoria do evento
- [ ] Admin → remover Gastos (`podeRegistrarGastos` vira master-only) e WhatsApp-financeiro
- [ ] Menu (`AppShell.gruposPara`) passa a ler `podePeloPapel()` em vez das condições soltas

### Fase 2 — (pulada: Admin fica por organização, decisão B)

### Fase 3 — operador vira "Gestor de Credenciamento"

- [ ] Migração: vínculo direto evento↔operador (tabela `operador_eventos` ou coluna) — hoje operador é só `organizacao_id`
- [ ] `criar_setor` + `atribuir_supervisor` liberados pro operador, escopo = evento dele
- [ ] `alcancaEvento` do operador passa a usar o vínculo direto, não a organização
- [ ] Estender `acessosDoEvento` (em `toggleAtivoEvento`) pra **inativar operador quando o evento dele encerrar** — hoje operador está de fora
- [ ] Inativar em massa os operadores órfãos atuais (sem evento ativo)

### Fase 4 — Encontro de Colaborador só-consulta pro suporte

- [ ] `/admin/encontrar` aceita suporte (hoje `ehMaster` only)
- [ ] Modo consulta: sem "atribuir colaborador", "trocar setor", "trocar supervisor", "chamar no WhatsApp" — some todos os botões de ação quando `role === 'suporte'`

### Fase 5 — verificação final

- [ ] Login e menu de cada papel conferem com a matriz
- [ ] Pra cada ação `escopo: 'evento'|'setor'`: chamar a Server Action com id de outro evento/setor → **negado**
- [ ] Pra cada `page.tsx` com `?evento=`: abrir evento fora do escopo pela URL → **negado**
- [ ] Atualizar este documento com o resultado (a matriz REAL pós-implementação)

## Riscos

- A Fase 0 toca ~108 arquivos. Fazer em lotes por módulo, um commit por lote.
- `getPerfil` é `cache()` por request — `exigirAcesso` chamar `getPerfil` de novo é de graça.
- `alcancaEvento`/`alcancaSetor` batem no banco. Numa action que já carregou o evento, passar o dado pronto em vez de refazer a query (otimização da Fase 0, não bloqueante).
- Overrides: as chaves de `permissoes_usuario`/`permissoes_organizacao` gravadas hoje usam as `chaveLegada` (`escanear`, `gerenciar_eventos`…). A `MATRIZ` respeita isso via `regra.chaveLegada`. Ações novas (`whatsapp`, `auditoria`, `relatorios`, `financeiro`, `ver_painel`…) têm `chaveLegada: null` e ignoram override antigo — se precisarem ser configuráveis, ganham chave própria e entram no `CAPACIDADES`.
