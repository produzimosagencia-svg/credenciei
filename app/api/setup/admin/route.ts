import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await admin.auth.admin.createUser({
    email: 'admin@credenciei.com',
    password: 'teste',
    email_confirm: true,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Cria perfil de superadmin
  await admin.from('perfis').upsert({
    id: data.user.id,
    nome: 'Admin',
    email: 'admin@credenciei.com',
    role: 'superadmin',
  })

  return NextResponse.json({ ok: true, id: data.user.id })
}
