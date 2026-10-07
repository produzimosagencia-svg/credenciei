'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getPerfil, supabaseAdmin, meusSetores, buscarTudo } from './supabase-server'
import { ehMaster, podeGerenciarUsuarios } from './permissions'
import { registrarAuditoria } from './auditoria'
import { mensagemAmigavel } from './erros'
import { validarCpf, formatCpf } from './format'
import { cpfParaEmail, normalizarCpf } from './usuario'
import { criarConviteSenhaSupervisor } from './supervisor-convite'
import { agendarTemplateSupervisor, enviarMensagemAgora } from './mensagens'
import { obterFuncionalidadesOrganizacao } from './actions'
import {
  PERMISSOES_PADRAO, caminhoDoSetor, MSG_FUNCIONALIDADE_DESLIGADA,
  type CandidatoEncarregado, type ContextoDoSetor, type EncarregadoDoSetor,
} from './encarregado'

/**
 * Encarregado — as ações de quem DESIGNA e REMOVE (supervisor do setor).
 *
 * O que o Encarregado enxerga mora em lib/encarregado-consulta.ts e nas telas
 * de /encarregado; aqui ficam só as escritas, e todas passam por UM porteiro
 * (`gestorDoSetor`): quem pode designar é o supervisor DAQUELE setor (ou o
 * administrador da organização, ou o master). O Encarregado em si não passa
 * por ele — não pode designar outro Encarregado.
 *
 * Toda ação devolve `{ ok }` / `{ erro }` — nada lança (o Next mascara
 * exceção de Server Action em produção).
 */

const AJUDA_MIGRACAO = 'Falta rodar a atualização do banco (upgrade-encarregado.sql).'

type Setor = ContextoDoSetor & { organizacaoId: string | null }

async function carregarSetor(fornecedorId: string): Promise<Setor | null> {
  const { data } = await supabaseAdmin
    .from('fornecedores')
    .select('id, nome, evento_id, subeventos(nome), eventos(nome, organizacao_id)')
    .eq('id', fornecedorId)
    .maybeSingle()
  if (!data) return null
  const evento = data.eventos as unknown as { nome?: string; organizacao_id?: string | null } | null
  const sub = data.subeventos as unknown as { nome?: string } | null
  return {
    fornecedorId: data.id as string,
    setor: data.nome as string,
    evento: evento?.nome ?? 'Evento',
    eventoId: data.evento_id as string,
    subevento: sub?.nome ?? null,
    organizacaoId: evento?.organizacao_id ?? null,
  }
}

/**
 * Quem pode designar/remover Encarregado deste setor: o supervisor dele
 * (papel ou só o vínculo), o administrador da MESMA organização, o master.
 */
type PerfilLogado = NonNullable<Awaited<ReturnType<typeof getPerfil>>>
async function gestorDoSetor(fornecedorId: string): Promise<{ ok: false; erro: string } | { ok: true; perfil: PerfilLogado; setor: Setor }> {
  const perfil = await getPerfil()
  if (!perfil) return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  const setor = await carregarSetor(fornecedorId)
  if (!setor) return { ok: false, erro: 'Setor não encontrado.' }

  const ehSupervisorDele = (await meusSetores(perfil)).some(s => s.id === fornecedorId)
  const ehAdminDaOrg = podeGerenciarUsuarios(perfil) && !!setor.organizacaoId && setor.organizacaoId === perfil.organizacao_id
  if (!ehMaster(perfil.role) && !ehSupervisorDele && !ehAdminDaOrg) {
    return { ok: false, erro: 'Você só pode designar Encarregado no setor que você supervisiona.' }
  }
  return { ok: true, perfil, setor }
}

// ─── Leitura (a tela do supervisor) ─────────────────────────────────────────

export type PainelEncarregados =
  | { ok: true; habilitado: boolean; setor: ContextoDoSetor; encarregados: EncarregadoDoSetor[] }
  | { erro: string }

/** Os Encarregados deste setor, o caminho completo (evento › subevento › setor) e se a função está liberada. */
export async function listarEncarregadosDoSetor(fornecedorId: string): Promise<PainelEncarregados> {
  try {
    const g = await gestorDoSetor(fornecedorId)
    if (!g.ok) return { erro: g.erro }
    const funcionalidades = await obterFuncionalidadesOrganizacao(g.setor.organizacaoId)

    const { data, error } = await supabaseAdmin
      .from('encarregados_setor')
      .select('id, created_at, concedido_por_nome, funcionarios(nome, cargo)')
      .eq('fornecedor_id', fornecedorId)
      .order('created_at', { ascending: false })
    if (error) {
      if (/encarregados_setor|does not exist|schema cache/i.test(error.message)) return { erro: AJUDA_MIGRACAO }
      return { erro: mensagemAmigavel(error) }
    }
    const encarregados: EncarregadoDoSetor[] = (data ?? []).map(l => {
      const f = l.funcionarios as unknown as { nome?: string; cargo?: string | null } | null
      return {
        id: l.id as string, nome: f?.nome ?? '—', cargo: f?.cargo ?? null,
        concedidoPorNome: (l.concedido_por_nome as string | null) ?? null, concedidoEm: l.created_at as string,
      }
    })
    const { organizacaoId: _org, ...setor } = g.setor
    void _org
    return { ok: true, habilitado: funcionalidades.encarregadosHabilitado, setor, encarregados }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * Quem da EQUIPE pode virar Encarregado: gente do próprio setor, aprovada e
 * ativa, que ainda não é Encarregada. Nunca devolve ninguém de fora da equipe
 * — a concessão confere isso de novo no servidor.
 */
export async function listarCandidatosEncarregado(fornecedorId: string): Promise<
  { ok: true; candidatos: CandidatoEncarregado[] } | { erro: string }
> {
  try {
    const g = await gestorDoSetor(fornecedorId)
    if (!g.ok) return { erro: g.erro }

    const equipe = await buscarTudo((de, ate) =>
      supabaseAdmin.from('funcionarios')
        .select('id, nome, cargo, telefone, cpf, ativo, status_credenciamento, descredenciado_em')
        .eq('fornecedor_id', fornecedorId).order('nome').order('id').range(de, ate),
    )
    const { data: jaSao } = await supabaseAdmin
      .from('encarregados_setor').select('funcionario_id').eq('fornecedor_id', fornecedorId)
    const excluidos = new Set((jaSao ?? []).map(l => l.funcionario_id as string))
    const meuCpf = normalizarCpf((g.perfil.cpf as string | null) ?? '')

    const candidatos: CandidatoEncarregado[] = equipe
      .filter(f => f.ativo !== false && f.status_credenciamento === 'aprovado' && !f.descredenciado_em)
      .filter(f => !excluidos.has(f.id as string))
      .filter(f => !meuCpf || normalizarCpf((f.cpf as string) ?? '') !== meuCpf)
      .map(f => ({
        funcionarioId: f.id as string, nome: f.nome as string, cargo: (f.cargo as string | null) ?? null,
        temTelefone: normalizarCpf((f.telefone as string) ?? '').length >= 10,
      }))
    return { ok: true, candidatos }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Dá a função de Encarregado a alguém DA EQUIPE deste setor.
 *
 * Recusa: função desligada na organização; pessoa de fora da equipe, não
 * aprovada, desativada ou sem WhatsApp; CPF que já é outro tipo de acesso
 * (supervisor, administrador…) — esses já têm um acesso próprio e não se
 * misturam com a consulta delegada.
 */
export async function concederEncarregado(
  funcionarioId: string, fornecedorId: string,
): Promise<{ ok: true; avisado: boolean; nome: string } | { erro: string }> {
  try {
    const g = await gestorDoSetor(fornecedorId)
    if (!g.ok) return { erro: g.erro }
    const { perfil, setor } = g

    const funcionalidades = await obterFuncionalidadesOrganizacao(setor.organizacaoId)
    if (!funcionalidades.encarregadosHabilitado) return { erro: MSG_FUNCIONALIDADE_DESLIGADA }

    // A pessoa TEM que ser da equipe deste setor — é a regra central.
    const { data: func } = await supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, telefone, cargo, ativo, status_credenciamento, descredenciado_em, fornecedor_id')
      .eq('id', funcionarioId).maybeSingle()
    if (!func || func.fornecedor_id !== fornecedorId) {
      return { erro: 'Esta pessoa não faz parte da equipe deste setor. O Encarregado precisa já estar na equipe.' }
    }
    if (func.ativo === false || func.descredenciado_em) return { erro: 'Esta pessoa não está ativa na equipe.' }
    if (func.status_credenciamento !== 'aprovado') return { erro: 'O credenciamento desta pessoa ainda não foi aprovado.' }

    const cpf = normalizarCpf((func.cpf as string) ?? '')
    if (!validarCpf(cpf)) return { erro: 'O CPF desta pessoa está inválido no cadastro. Corrija antes de continuar.' }
    const telefone = normalizarCpf((func.telefone as string) ?? '')
    if (telefone.length < 10 || telefone.length > 13) {
      return { erro: 'Esta pessoa não tem um WhatsApp válido cadastrado — é por ele que o acesso é enviado.' }
    }
    if (cpf === normalizarCpf((perfil.cpf as string | null) ?? '')) {
      return { erro: 'Você já é responsável por este setor — não precisa ser Encarregado.' }
    }

    const { data: jaTem } = await supabaseAdmin
      .from('encarregados_setor').select('id').eq('funcionario_id', funcionarioId).maybeSingle()
    if (jaTem) return { erro: 'Esta pessoa já é Encarregada deste setor.' }

    // O acesso (login). CPF sem acesso → cria; já é Encarregado de outro setor → reaproveita; outro papel → recusa.
    const { data: existente } = await supabaseAdmin
      .from('perfis').select('id, role, ativo, nome').eq('cpf', cpf).maybeSingle()
    let perfilId: string
    let criouAgora = false
    if (existente) {
      if (existente.role !== 'encarregado') {
        return { erro: `Este CPF já tem outro acesso no sistema (${existente.nome}). Quem já tem acesso próprio não pode ser Encarregado — fale com o administrador.` }
      }
      perfilId = existente.id as string
      if (existente.ativo === false) {
        await supabaseAdmin.from('perfis').update({ ativo: true, telefone }).eq('id', perfilId)
      }
    } else {
      const { data: user, error: erroAuth } = await supabaseAdmin.auth.admin.createUser({
        email: cpfParaEmail(cpf),
        // Nunca mostrada nem enviada: só mantém a conta fechada até a pessoa usar o convite.
        password: randomBytes(32).toString('base64url'),
        email_confirm: true,
      })
      if (erroAuth) {
        if (/already|exist|registered/i.test(erroAuth.message)) {
          return { erro: `Já existe um login para o CPF ${formatCpf(cpf)}, mas sem perfil. Fale com o suporte.` }
        }
        return { erro: mensagemAmigavel(erroAuth) }
      }
      perfilId = user.user!.id
      criouAgora = true
      /*
       * SEM organização e SEM setor ativo no perfil — de propósito. Quase toda
       * checagem do sistema que não olha o papel cai em "é da mesma
       * organização" ou "é o setor aberto agora"; com os dois em branco, nenhum
       * deles casa. O escopo do Encarregado vive só em `encarregados_setor`.
       */
      const { error: erroPerfil } = await supabaseAdmin.from('perfis').insert([{
        id: perfilId, nome: func.nome, email: cpfParaEmail(cpf), telefone, cpf, ativo: true,
        role: 'encarregado', organizacao_id: null, fornecedor_id: null,
      }])
      if (erroPerfil) {
        await supabaseAdmin.auth.admin.deleteUser(perfilId).catch(() => {})
        return { erro: mensagemAmigavel(erroPerfil) }
      }
    }

    const { error: erroVinculo } = await supabaseAdmin.from('encarregados_setor').insert([{
      perfil_id: perfilId, fornecedor_id: fornecedorId, funcionario_id: funcionarioId,
      permissoes: PERMISSOES_PADRAO, concedido_por: perfil.id, concedido_por_nome: perfil.nome,
    }])
    if (erroVinculo) {
      if (criouAgora) {
        await supabaseAdmin.from('perfis').delete().eq('id', perfilId)
        await supabaseAdmin.auth.admin.deleteUser(perfilId).catch(() => {})
      }
      if (/encarregados_setor|does not exist|schema cache|perfis_role_check/i.test(erroVinculo.message)) return { erro: AJUDA_MIGRACAO }
      return { erro: mensagemAmigavel(erroVinculo) }
    }

    after(() => registrarAuditoria({
      perfil, acao: 'CONCESSAO_ENCARREGADO', funcionarioId,
      campoAlterado: `Encarregado — ${caminhoDoSetor(setor)}`,
      valorNovo: `${func.nome} — CPF ${formatCpf(cpf)}`,
      eventoId: setor.eventoId, organizacaoId: setor.organizacaoId ?? undefined,
    }))

    // A mensagem NÃO desfaz o acesso se falhar (ao contrário do supervisor): o
    // template novo precisa estar aprovado na Meta, e quem foi designado ainda
    // consegue entrar por "Esqueci a senha".
    let avisado = false
    try {
      const link = await criarConviteSenhaSupervisor({
        perfilId, nome: func.nome as string, cpf, eventoId: setor.eventoId,
        evento: setor.evento, setor: caminhoDoSetor({ evento: '', subevento: setor.subevento, setor: setor.setor }),
        papel: 'encarregado',
      })
      const mensagemId = await agendarTemplateSupervisor({
        eventoId: setor.eventoId,
        telefone,
        template: 'cadastro_encarregado_cpf_link',
        // Ordem do texto: {{1}} nome · {{2}} setor (com o subevento) · {{3}} evento · {{4}} CPF · {{5}} link
        parametros: [
          func.nome as string,
          [setor.subevento, setor.setor].filter(Boolean).join(' › '),
          setor.evento,
          formatCpf(cpf),
          link,
        ],
      })
      if (mensagemId) after(() => enviarMensagemAgora(mensagemId).catch(e => console.error('[encarregado] envio imediato falhou', e)))
      avisado = true
    } catch (e) {
      console.error('[encarregado] mensagem de acesso não agendou', { fornecedorId, funcionarioId, erro: e })
    }

    revalidatePath('/admin/encarregados')
    return { ok: true, avisado, nome: func.nome as string }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * Tira a função de Encarregado. A pessoa continua na equipe; só perde o
 * acesso de consulta. Se era o último setor dela, o login é desativado (não
 * apagado — o histórico fica; designar de novo reativa).
 */
export async function removerEncarregado(encarregadoId: string): Promise<{ ok: true } | { erro: string }> {
  try {
    const { data: vinculo } = await supabaseAdmin
      .from('encarregados_setor').select('id, perfil_id, fornecedor_id, funcionario_id').eq('id', encarregadoId).maybeSingle()
    if (!vinculo) return { erro: 'Este Encarregado já foi removido.' }

    const g = await gestorDoSetor(vinculo.fornecedor_id as string)
    if (!g.ok) return { erro: g.erro }

    const { data: func } = await supabaseAdmin.from('funcionarios').select('nome').eq('id', vinculo.funcionario_id as string).maybeSingle()
    const { error } = await supabaseAdmin.from('encarregados_setor').delete().eq('id', encarregadoId)
    if (error) return { erro: mensagemAmigavel(error) }

    const { count } = await supabaseAdmin
      .from('encarregados_setor').select('id', { count: 'exact', head: true }).eq('perfil_id', vinculo.perfil_id as string)
    if (!count) {
      await supabaseAdmin.from('perfis').update({ ativo: false }).eq('id', vinculo.perfil_id as string).eq('role', 'encarregado')
    }

    after(() => registrarAuditoria({
      perfil: g.perfil, acao: 'REMOCAO_ENCARREGADO', funcionarioId: vinculo.funcionario_id as string,
      campoAlterado: `Encarregado — ${caminhoDoSetor(g.setor)}`,
      valorAnterior: func?.nome as string | undefined,
      eventoId: g.setor.eventoId, organizacaoId: g.setor.organizacaoId ?? undefined,
    }))
    revalidatePath('/admin/encarregados')
    return { ok: true }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}
