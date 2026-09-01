import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].trim().replace(/^"|"$/g, '')])
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: forn } = await db.from('fornecedores')
  .select('id, nome, evento_id, exige_meio, eventos(nome)')
  .eq('id', '30107c6d-30c3-47b2-9b66-b8b841ca3356').single()
console.log('Setor do Juan:', JSON.stringify(forn, null, 2))

// Registros dele hoje
const { data: regs } = await db.from('registros')
  .select('tipo, created_at, data_ref').eq('funcionario_id', '0320690f-9f92-44dc-b684-95e90b310a0c')
console.log('Registros dele:', JSON.stringify(regs, null, 2))

// O dia de hoje na jornada
const { data: dia } = await db.from('jornada_dias')
  .select('id, data, tipo, cancelado').eq('evento_id', forn.evento_id).eq('data', '2026-09-01')
console.log('Dia hoje:', JSON.stringify(dia, null, 2))
