/**
 * Restaura os dados de mensagens_agendadas e mensagens_log a partir do backup
 * tirado antes do drop acidental de 31/07/2026.
 *
 * Rodar DEPOIS de reparo-2026-08-01.sql (que recria as tabelas vazias):
 *   node supabase/restaurar-mensagens.mjs
 *
 * Idempotente: usa upsert por id, então rodar duas vezes não duplica.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BACKUP = 'C:/Users/Juan Muzy/Documents/CRM/backup-supabase-2026-07-31'

// Lê as credenciais do .env.local do projeto
for (const linha of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ler = (nome) => JSON.parse(readFileSync(`${BACKUP}/${nome}.json`, 'utf8'))

async function restaurar(tabela, linhas) {
  if (!linhas.length) return console.log(`${tabela}: backup vazio, nada a fazer`)
  // Em lotes: o payload inteiro de mensagens_log tem jsonb grande
  const LOTE = 100
  let total = 0
  for (let i = 0; i < linhas.length; i += LOTE) {
    const { error } = await db.from(tabela).upsert(linhas.slice(i, i + LOTE), { onConflict: 'id' })
    if (error) {
      console.error(`${tabela}: ERRO no lote ${i / LOTE + 1} —`, error.message)
      return
    }
    total += Math.min(LOTE, linhas.length - i)
  }
  const { count } = await db.from(tabela).select('id', { count: 'exact', head: true })
  console.log(`${tabela}: ${total} linhas enviadas · ${count} na tabela agora`)
}

// A fila vem primeiro: mensagens_log tem FK para mensagens_agendadas.
await restaurar('mensagens_agendadas', ler('mensagens_agendadas'))
await restaurar('mensagens_log', ler('mensagens_log'))
