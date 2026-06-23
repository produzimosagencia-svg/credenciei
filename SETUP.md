# Setup do Sistema de Credenciamento

## Opção A — Supabase local (requer Docker)

1. Instale o Docker Desktop: https://www.docker.com/products/docker-desktop/
2. Abra o Docker Desktop e aguarde iniciar
3. No terminal, dentro desta pasta:

```bash
supabase start
```

4. Copie as credenciais exibidas e atualize `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` → API URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → anon key

## Opção B — Supabase Cloud (mais fácil, gratuito)

1. Acesse https://supabase.com e crie uma conta
2. Crie um novo projeto
3. Vá em **SQL Editor** e cole o conteúdo de `supabase/schema.sql`
4. Vá em **Project Settings > API** e copie:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Atualize o arquivo `.env.local` com esses valores

## Rodando o projeto

```bash
npm run dev
```

Acesse: http://localhost:3000

## Estrutura do sistema

- `/admin` → Painel administrativo (eventos, fornecedores)
- `/admin/eventos/novo` → Criar evento
- `/admin/eventos/[id]` → Detalhes do evento + fornecedores
- `/admin/eventos/[id]/fornecedor/[fid]` → Lista de funcionários
- `/form/[token]` → Formulário público para funcionários preencherem
- `/credential/[token]` → Credencial com QR Code do funcionário
- `/scan` → Câmera para operador escanear QR codes no evento
