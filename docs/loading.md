# Loading do Credenciei — o padrão único

O indicador de carregamento do sistema é **a marca oficial girando**
(`public/marca/iso-laranja.png`). Nunca um spinner genérico, nunca dois
estilos na mesma tela. Novo módulo importa daqui e não inventa outro.

## O kit

| Import | Quando usar |
|---|---|
| `<LogoLoading tamanho="xs\|sm\|md\|lg\|xl" />` — `@/components/LogoLoading` | A marca girando, sozinha. Dentro de botão (`xs`), em linha "carregando…" (`sm`), num card (`md`), numa seção vazia (`lg`). Server-safe. |
| `<LoadingTela mensagem? sobreConteudo? />` — `@/components/LogoLoading` | Tela cheia: marca grande centralizada. `sobreConteudo` = véu escuro por cima do que já está na tela (ação demorada); sem ele = fundo do sistema (rota carregando). Server-safe. |
| `<LoadingTelaQuando ativo mensagem? sobreConteudo? />` — `@/components/loading-suave` | Igual à `LoadingTela`, mas SEMPRE montada e controlada por `ativo` — é o que faz o anti-flicker funcionar. Prefira esta a `{isPending && <LoadingTela/>}`. |
| `<BotaoOcupado ocupado icone={<Save/>} className="btn btn-primario">Salvar</BotaoOcupado>` — `@/components/loading-suave` | Botão que trava clique duplo, troca o `icone` pela marca enquanto processa, e volta sozinho no sucesso OU no erro. |
| `useLoadingSuave(ocupado, { atrasoMs?, minimoMs? })` — `@/components/loading-suave` | Hook cru, pra montar feedback próprio com as regras de UX embutidas. |
| `<FormLoadingOverlay mensagem? />` — `@/components/LoadingOverlay` | Dentro de um `<form action={serverAction}>`: overlay aparece sozinho no envio (via `useFormStatus`), com anti-flicker. |
| `app/loading.tsx` e `app/**/loading.tsx` | Skeleton/loader de ROTA. `/admin/loading.tsx` já cobre todo o admin; `/app/loading.tsx` cobre o resto. Rota nova com layout próprio ganha o seu. |

## As regras de UX (todas no kit)

1. **Sempre há feedback** numa operação — a peça certa pro contexto.
2. **Um ícone só** — a marca. `LogoLoading` em todo lugar.
3. **Contextual**: botão → `<BotaoOcupado>` · tabela/lista → skeleton no `loading.tsx` ou `<LogoLoading tamanho="sm">` no cabeçalho · página → `<LoadingTela>` · componente → `<LogoLoading>` só nele.
4. **Sem clique duplo** — `<BotaoOcupado>` já desabilita enquanto `ocupado`. Em `<form>`, `useFormStatus` já trava.
5. **Some no fim** — sucesso ou erro. `ocupado` volta a `false` no `finally`; o kit reage.
6. **Sem estilos soltos** — proibido `Loader2`, `animate-spin` à mão, borda girando. `grep -rn "Loader2\|animate-spin" app/ components/` tem que voltar só os `loading.tsx` de skeleton.
7. **Reutilizável** — é este arquivo. Nada novo por módulo.
8. **Sem flicker** — `useLoadingSuave` só mostra depois de `atrasoMs` (140) ocupado. Operação de 80ms não pisca nada.
9. **Operação longa fica visível** — `minimoMs` (360) garante que, uma vez mostrado, não some num frame.
10. **Erro tira o loading** — quem chama põe `ocupado=false` e renderiza o erro no lugar; o kit não prende a UI.

## Estado (10/09/2026)

- Kit visual + `~26` spinners `Loader2`/hand-rolled trocados: commit `51d152e`.
- Anti-flicker (`useLoadingSuave`), `<BotaoOcupado>`, `<LoadingTelaQuando>`,
  `FormLoadingOverlay` com anti-flicker, login com a marca: commit desta revisão.
- Rotas: todas cobertas por `loading.tsx` próprio ou pelo genérico de segmento.
