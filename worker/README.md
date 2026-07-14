# Worker de lembretes WhatsApp

Processo independente do Vercel, pensado pra rodar 24/7 na VPS (EasyPanel),
do lado da Evolution API. Faz o mesmo trabalho da rota `/api/cron/enviar-mensagens`
do Next (que serve só de fallback redundante) — os dois chamam a mesma função
`processarFilaMensagens()` de `lib/mensagens.ts`, então nunca há lógica duplicada.

## Deploy no EasyPanel

1. Criar um novo serviço "App" a partir deste mesmo repositório Git.
2. **Build Context**: raiz do repositório (não a pasta `worker/`).
3. **Dockerfile Path**: `worker/Dockerfile`.
4. Variáveis de ambiente obrigatórias:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `EVOLUTION_API_URL`
   - `EVOLUTION_API_KEY`
   - `EVOLUTION_INSTANCE_NAME`
5. Sem porta HTTP exposta — é um processo de background puro (loop `setInterval`), não um servidor.

## Rodando localmente pra testar

Da raiz do repo (usa o `node_modules` já instalado pro app principal):

```bash
npx tsx worker/index.ts
```
