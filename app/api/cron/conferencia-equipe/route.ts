import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { planilhaEquipeCsv } from '@/lib/conferencia'
import { enviarEmail, molduraEmail } from '@/lib/email'
import { registrarExecucaoConferenciaEquipe } from '@/lib/performance-checks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Lembrete D-1 da conferência de equipe.
 *
 * Roda 1x/dia (ver vercel.json). Pra cada evento ATIVO que começa nas
 * próximas ~25h, e pra cada setor dele que TEM supervisor:
 *   1. garante a linha `conferencias_equipe` (status pendente) — é o que faz
 *      o banner e o painel do organizador aparecerem;
 *   2. se ainda não mandou (`email_enviado_em` nulo) e o supervisor tem
 *      `email_contato` de verdade, manda o email com a planilha (CSV) anexa.
 *
 * Idempotente: a linha usa `upsert ignoreDuplicates`; o email só sai uma vez.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const agora = new Date()
  const limite = new Date(agora.getTime() + 25 * 60 * 60 * 1000)

  const { data: eventos } = await supabaseAdmin
    .from('eventos')
    .select('id, nome, data_inicio')
    .eq('ativo', true)
    .gte('data_inicio', agora.toISOString())
    .lte('data_inicio', limite.toISOString())

  let linhasCriadas = 0
  let emailsEnviados = 0
  let semEmail = 0
  const erros: string[] = []

  for (const ev of eventos ?? []) {
    const { data: setores } = await supabaseAdmin
      .from('fornecedores').select('id, nome').eq('evento_id', ev.id)
    if (!setores?.length) continue

    // Supervisores destes setores (pelo setor ativo do perfil).
    const idsSetores = setores.map(s => s.id as string)
    const { data: sups } = await supabaseAdmin
      .from('perfis')
      .select('id, nome, fornecedor_id, email_contato')
      .eq('role', 'supervisor')
      .neq('ativo', false)
      .in('fornecedor_id', idsSetores)

    const setorPorId = new Map(setores.map(s => [s.id as string, s.nome as string]))

    for (const sup of sups ?? []) {
      const fid = sup.fornecedor_id as string
      const setorNome = setorPorId.get(fid) ?? 'Setor'

      // 1) garante a linha
      const { error: erroUpsert } = await supabaseAdmin
        .from('conferencias_equipe')
        .upsert({ fornecedor_id: fid, evento_id: ev.id }, { onConflict: 'fornecedor_id', ignoreDuplicates: true })
      if (!erroUpsert) linhasCriadas++

      // 2) email, se ainda não foi e há endereço real
      const { data: linha } = await supabaseAdmin
        .from('conferencias_equipe').select('id, email_enviado_em').eq('fornecedor_id', fid).maybeSingle()
      if (linha?.email_enviado_em) continue

      const email = (sup.email_contato as string | null)?.trim()
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { semEmail++; continue }

      try {
        const csv = await planilhaEquipeCsv(fid)
        const link = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/conferencia/${fid}`
        const r = await enviarEmail({
          para: email,
          assunto: `Confira sua equipe — ${ev.nome}`,
          html: molduraEmail('Confira sua equipe antes do evento', `
            <p>Olá, ${sup.nome}.</p>
            <p>O evento <strong>${ev.nome}</strong> começa amanhã. Antes disso, confira no sistema
            a lista de pessoas vinculadas ao setor <strong>${setorNome}</strong> e confirme quem
            realmente faz parte da equipe — quem não for, você tira pela própria tela.</p>
            <p style="margin:20px 0"><a href="${link}" style="background:#FF4A0F;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:700;display:inline-block">Conferir a equipe</a></p>
            <p style="font-size:13px;color:#78716c">A planilha da equipe atual vai anexa a este email, para consulta.</p>
          `),
          anexos: [{ nome: `equipe-${setorNome.replace(/[^\w]+/g, '-').toLowerCase()}.csv`, conteudo: csv }],
        })
        if (r.ok) {
          await supabaseAdmin.from('conferencias_equipe')
            .update({ email_enviado_em: new Date().toISOString() }).eq('fornecedor_id', fid)
          emailsEnviados++
        } else {
          erros.push(`${setorNome}: ${r.motivo}`)
        }
      } catch (e) {
        erros.push(`${setorNome}: ${e instanceof Error ? e.message : 'erro'}`)
      }
    }
  }

  // Sinal de vida pro Painel de Performance — mesmo padrão do WhatsApp em
  // lib/saude.ts: sem isto, ninguém sabe distinguir "não tinha nada pra fazer
  // hoje" de "o cron parou de rodar".
  await registrarExecucaoConferenciaEquipe()

  return NextResponse.json({
    eventos: eventos?.length ?? 0,
    linhasCriadas, emailsEnviados, supervisoresSemEmail: semEmail,
    erros: erros.slice(0, 20),
  })
}
