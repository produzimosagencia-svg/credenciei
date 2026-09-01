import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim().replace(/^"|"$/g,'')]))
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// Todo supervisor/operador: confirma o e-mail interno e limpa pendencia.
// NAO toca em senha.
const { data: perfis } = await db.from('perfis')
  .select('id, nome, email, role').in('role',['supervisor','operador_portao'])

let corrigidos = 0, jaOk = 0
for (const p of perfis) {
  const { data: u } = await db.auth.admin.getUserById(p.id)
  if (!u?.user) continue
  const pendente = u.user.new_email || !u.user.email_confirmed_at
  if (!pendente) { jaOk++; continue }
  const { error } = await db.auth.admin.updateUserById(p.id, { email: p.email, email_confirm: true })
  console.log(`${error ? 'ERRO' : 'corrigido'}: ${p.nome} ${error ? '- '+error.message : ''}`)
  if (!error) corrigidos++
}
console.log(`\nContas ja OK: ${jaOk} | corrigidas: ${corrigidos}`)
