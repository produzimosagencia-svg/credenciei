# Credenciei

Plataforma multi-organização de credenciamento e controle de presença para
eventos: cadastro de equipe por setor, credencial com QR assinado por etapa
do dia, registro de entrada/meio/saída (scanner + foto/GPS), lembretes por
WhatsApp, relatórios, financeiro e backlog comercial.

## Antes de mexer no código

Leia **[AGENTS.md](AGENTS.md)**. Este é um fork do Next.js com mudanças de
API e convenção — entre elas, `middleware.ts` se chama `proxy.ts`. A
documentação que vale é a de `node_modules/next/dist/docs/`.

## Rodar localmente

```bash
npm install
npm run dev          # http://localhost:3000
```

Precisa de um `.env.local` com as chaves do Supabase e da Meta — ver
**[SETUP.md](SETUP.md)**.

## Scripts

| Comando | O quê |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento (Turbopack) |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm run coerencia` | Testa que as mensagens ao usuário não contradizem as regras do código — roda antes de todo deploy |

## Estrutura

| Pasta | |
| --- | --- |
| `app/` | Rotas (App Router). `app/admin/` é o painel; `app/form`, `app/credential`, `app/portaria` são as telas públicas |
| `lib/` | Regra de negócio e Server Actions. `lib/actions*.ts` são as mutações; o resto é leitura |
| `components/` | UI compartilhada |
| `supabase/` | Migrações versionadas (`upgrade-*.sql`), aplicadas manualmente no SQL Editor |
| `worker/` | Worker de WhatsApp que roda 24/7 numa VPS, fora da Vercel |
| `testes/` | `coerencia.mjs` |
| `docs/` | Material de referência (marca, guias de processo) |
