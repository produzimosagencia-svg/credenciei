import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].trim().replace(/^"|"$/g, '')])
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const eventoId = 'd7eef7b8-ce3d-487a-b8ac-c559354722e7'

// 1) Os setores ainda existem?
const { count } = await db.from('fornecedores').select('id', { count: 'exact', head: true }).eq('evento_id', eventoId)
console.log('SETORES no banco:', count)

const { count: pessoas } = await db.from('funcionarios')
  .select('id, fornecedores!inner(evento_id)', { count: 'exact', head: true })
  .eq('fornecedores.evento_id', eventoId)
console.log('PESSOAS no banco:', pessoas)

// 2) A coluna nova existe? (é isto que quebra a tela)
const { error: e1 } = await db.from('fornecedores').select('exige_meio').limit(1)
console.log('coluna exige_meio:', e1 ? 'NAO EXISTE -> ' + e1.message : 'ok')

const { error: e2 } = await db.from('eventos').select('checkin_autonomo').limit(1)
console.log('coluna checkin_autonomo:', e2 ? 'NAO EXISTE -> ' + e2.message : 'ok')

const { error: e3 } = await db.from('perfis').select('id').eq('role', 'operador_portao').limit(1)
console.log('role operador_portao:', e3 ? 'ERRO -> ' + e3.message : 'ok')
