'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getPerfil, supabaseAdmin, meusSetores, buscarTudo } from './supabase-server'
import { ehMaster, podeGerenciarUsuarios, ROLE_LABELS, type Role } from './permissions'
import { registrarAuditoria } from './auditoria'
import { mensagemAmigavel } from './erros'
import { validarCpf, formatCpf } from './format'
import { cpfParaEmail, normalizarCpf } from './usuario'
import { criarConviteSenhaSupervisor } from './supervisor-convite'
import { emLotes } from './lotes'
import { agendarTemplateSupervisor, enviarMensagemAgora } from './mensagens'
import { obterFuncionalidadesOrganizacao } from './actions'
import {
  PERMISSOES_PADRAO, MSG_FUNCIONALIDADE_DESLIGADA, listarEmTexto, nomeDoSetorComArea,
  type CandidatoEncarregado, type EncarregadoDoEvento, type SetorOpcao,
} from './encarregado'

/**
 * Encarregado — as ações de quem DESIGNA e REMOVE (supervisor do setor).
 *
 * UM cadastro, VÁRIOS setores, UMA mensagem. O supervisor escolhe a pessoa da
 * equipe e marca em quais dos SEUS setores (do evento aberto) ela fica como
 * Encarregada; o acesso é um login só, e lá dentro ela escolhe qual setor olhar
 * — a mesma lógica de "Meus eventos / Meus fornecedores" do supervisor.
 *
 * O que o Encarregado enxerga mora em lib/encarregado-consulta.ts e nas telas
 * de /encarregado; aqui ficam só as escritas, e todas passam por UM porteiro
 * (`escopoDoGestor`): quem pode designar é o supervisor DOS SETORES marcados
 * (ou o administrador da organização, ou o master). O Encarregado em si não
 * passa por ele — não pode designar outro.
 *
 * Toda ação devolve `{ ok }` / `{ erro }` — nada lança (o Next mascara
 * exceção de Server Action em produção).
 */

const AJUDA_MIGRACAO = 'Falta rodar a atualização do banco (upgrade-encarregado.sql e upgrade-encarregado-multisetor.sql).'
const ERRO_BANCO_ENCARREGADO = /encarregados_setor|does not exist|schema cache|perfis_role_check|funcionario_id_key/i

type PerfilLogado = NonNullable<Awaited<ReturnType<typeof getPerfil>>>
type Escopo =
  | { ok: false; erro: string }
  | { ok: true; perfil: PerfilLogado; evento: { id: string; nome: string; organizacaoId: string | null }; setores: SetorOpcao[] }

/**
 * Os setores deste evento que QUEM CHAMA pode dar em consulta: os que ele
 * supervisiona (papel ou só o vínculo), todos os da organização pro
 * administrador, todos pro master.
 */
async function escopoDoGestor(eventoId: string): Promise<Escopo> {
  const perfil = await getPerfil()
  if (!perfil) return { ok: false, erro: 'Sessão expirada. Entre de novo.' }

  const { data: ev } = await supabaseAdmin.from('eventos').select('id, nome, organizacao_id').eq('id', eventoId).maybeSingle()
  if (!ev) return { ok: false, erro: 'Evento não encontrado.' }
  const organizacaoId = (ev.organizacao_id as string | null) ?? null

  const { data: forns } = await supabaseAdmin
    .from('fornecedores').select('id, nome, subeventos(nome)').eq('evento_id', eventoId).order('nome').limit(2000)
  const todos: SetorOpcao[] = (forns ?? []).map(f => ({
    id: f.id as string, nome: (f.nome as string).trim(),
    area: (f.subeventos as unknown as { nome?: string } | null)?.nome ?? null,
  }))

  let setores: SetorOpcao[]
  if (ehMaster(perfil.role) || (podeGerenciarUsuarios(perfil) && !!organizacaoId && organizacaoId === perfil.organizacao_id)) {
    setores = todos
  } else {
    const meus = new Set((await meusSetores(perfil)).filter(s => s.evento_id === eventoId).map(s => s.id))
    setores = todos.filter(s => meus.has(s.id))
  }
  if (!setores.length) return { ok: false, erro: 'Você não supervisiona nenhum setor deste evento.' }
  return { ok: true, perfil, evento: { id: ev.id as string, nome: ev.nome as string, organizacaoId }, setores }
}

// ─── Leitura (a tela do supervisor) ─────────────────────────────────────────

export type PainelEncarregados =
  | { ok: true; habilitado: boolean; evento: { id: string; nome: string }; setores: SetorOpcao[]; encarregados: EncarregadoDoEvento[] }
  | { erro: string }

/** Os Encarregados dos setores do supervisor neste evento, agrupados por pessoa, e se a função está liberada. */
export async function listarEncarregadosDoEvento(eventoId: string): Promise<PainelEncarregados> {
  try {
    const g = await escopoDoGestor(eventoId)
    if (!g.ok) return { erro: g.erro }
    const funcionalidades = await obterFuncionalidadesOrganizacao(g.evento.organizacaoId)

    const { data, error } = await supabaseAdmin
      .from('encarregados_setor')
      .select('funcionario_id, fornecedor_id, created_at, concedido_por_nome, funcionarios(nome, cargo)')
      .in('fornecedor_id', g.setores.map(s => s.id))
      .order('created_at', { ascending: false })
    if (error) {
      if (ERRO_BANCO_ENCARREGADO.test(error.message)) return { erro: AJUDA_MIGRACAO }
      return { erro: mensagemAmigavel(error) }
    }

    const porId = new Map(g.setores.map(s => [s.id, s]))
    const grupos = new Map<string, EncarregadoDoEvento>()
    for (const l of data ?? []) {
      const setor = porId.get(l.fornecedor_id as string)
      if (!setor) continue
      const fid = l.funcionario_id as string
      const f = l.funcionarios as unknown as { nome?: string; cargo?: string | null } | null
      const atual = grupos.get(fid) ?? {
        funcionarioId: fid, nome: f?.nome ?? '—', cargo: f?.cargo ?? null, setores: [],
        concedidoPorNome: (l.concedido_por_nome as string | null) ?? null, concedidoEm: l.created_at as string,
      }
      atual.setores.push(setor)
      // O "desde" é o mais antigo dos vínculos da pessoa.
      if ((l.created_at as string) < atual.concedidoEm) atual.concedidoEm = l.created_at as string
      grupos.set(fid, atual)
    }
    return {
      ok: true, habilitado: funcionalidades.encarregadosHabilitado,
      evento: { id: g.evento.id, nome: g.evento.nome }, setores: g.setores,
      encarregados: [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * Quem da EQUIPE pode virar Encarregado: gente de QUALQUER dos setores do
 * supervisor neste evento, aprovada e ativa, que ainda não é Encarregada.
 * Nunca devolve ninguém de fora da equipe — a gravação confere isso de novo.
 */
export async function listarCandidatosEncarregado(eventoId: string): Promise<
  { ok: true; candidatos: CandidatoEncarregado[] } | { erro: string }
> {
  try {
    const g = await escopoDoGestor(eventoId)
    if (!g.ok) return { erro: g.erro }
    const ids = g.setores.map(s => s.id)

    const equipe = await buscarTudo((de, ate) =>
      supabaseAdmin.from('funcionarios')
        .select('id, nome, cargo, telefone, cpf, fornecedor_id, ativo, status_credenciamento, descredenciado_em')
        .in('fornecedor_id', ids).order('nome').order('id').range(de, ate),
    )
    const { data: jaSao } = await supabaseAdmin.from('encarregados_setor').select('funcionario_id').in('fornecedor_id', ids)
    const excluidos = new Set((jaSao ?? []).map(l => l.funcionario_id as string))
    const meuCpf = normalizarCpf((g.perfil.cpf as string | null) ?? '')
    const setorPorId = new Map(g.setores.map(s => [s.id, s]))

    // Quem já tem uma função no sistema (supervisor, operador de portão…) não pode ser Encarregado:
    // a lista mostra, mas não deixa escolher. O servidor confere de novo ao gravar.
    const funcaoPorCpf = new Map<string, string>()
    const cpfsDaEquipe = [...new Set(equipe.map(f => normalizarCpf((f.cpf as string) ?? '')).filter(c => c.length === 11))]
    for (const lote of emLotes(cpfsDaEquipe, 200)) {
      const { data: perfis } = await supabaseAdmin.from('perfis').select('cpf, role').in('cpf', lote)
      for (const p of perfis ?? []) {
        if (p.role !== 'encarregado') funcaoPorCpf.set(p.cpf as string, ROLE_LABELS[p.role as Role] ?? (p.role as string))
      }
    }

    const candidatos: CandidatoEncarregado[] = equipe
      .filter(f => f.ativo !== false && f.status_credenciamento === 'aprovado' && !f.descredenciado_em)
      .filter(f => !excluidos.has(f.id as string))
      .filter(f => !meuCpf || normalizarCpf((f.cpf as string) ?? '') !== meuCpf)
      .map(f => ({
        funcionarioId: f.id as string, nome: f.nome as string, cargo: (f.cargo as string | null) ?? null,
        setorId: f.fornecedor_id as string, setorNome: nomeDoSetorComArea(setorPorId.get(f.fornecedor_id as string)),
        temTelefone: normalizarCpf((f.telefone as string) ?? '').length >= 10,
        funcaoAtual: funcaoPorCpf.get(normalizarCpf((f.cpf as string) ?? '')) ?? null,
      }))
    return { ok: true, candidatos }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Define EM QUAIS setores (dos que o chamador pode dar) esta pessoa é
 * Encarregada — cria, ajusta e (com lista vazia) tira.
 *
 * Recusa: função desligada na organização; pessoa de fora da equipe, não
 * aprovada, desativada ou sem WhatsApp; setor fora do alcance de quem chama;
 * CPF que já é outro tipo de acesso (supervisor, administrador…).
 *
 * UMA mensagem por pessoa e evento: quem recebe o primeiro acesso naquele
 * evento ganha o aviso com TODOS os setores; ajustar a lista depois não manda
 * outro (a pessoa vê a lista nova dentro do próprio acesso).
 */
export async function salvarEncarregado(
  funcionarioId: string, eventoId: string, fornecedorIds: string[],
): Promise<{ ok: true; primeiroAcesso: boolean; mensagemEnviada: boolean; nome: string; total: number } | { erro: string }> {
  try {
    const g = await escopoDoGestor(eventoId)
    if (!g.ok) return { erro: g.erro }
    const { perfil, evento } = g
    const setorPorId = new Map(g.setores.map(s => [s.id, s]))

    const escolhidos = [...new Set(fornecedorIds ?? [])]
    if (escolhidos.some(id => !setorPorId.has(id))) {
      return { erro: 'Um dos setores marcados não é seu. Você só dá acesso aos setores que supervisiona.' }
    }

    // A pessoa TEM que ser da equipe de um dos setores do chamador — é a regra central.
    const { data: func } = await supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, telefone, cargo, ativo, status_credenciamento, descredenciado_em, fornecedor_id')
      .eq('id', funcionarioId).maybeSingle()
    if (!func || !setorPorId.has(func.fornecedor_id as string)) {
      return { erro: 'Esta pessoa não faz parte da sua equipe neste evento. O Encarregado precisa já estar na equipe.' }
    }

    const { data: atuais } = await supabaseAdmin
      .from('encarregados_setor').select('id, perfil_id, fornecedor_id')
      .eq('funcionario_id', funcionarioId).in('fornecedor_id', g.setores.map(s => s.id))
    const jaTinha = new Set((atuais ?? []).map(l => l.fornecedor_id as string))
    const paraAdicionar = escolhidos.filter(id => !jaTinha.has(id))
    const paraRemover = (atuais ?? []).filter(l => !escolhidos.includes(l.fornecedor_id as string))
    if (!paraAdicionar.length && !paraRemover.length) return { erro: 'Nada mudou — escolha os setores em que a pessoa será Encarregada.' }

    // Remover é sempre permitido; dar acesso depende da funcionalidade ligada e de a pessoa estar apta.
    let perfilId = (atuais ?? [])[0]?.perfil_id as string | undefined
    let criouAgora = false
    const cpf = normalizarCpf((func.cpf as string) ?? '')
    const telefone = normalizarCpf((func.telefone as string) ?? '')

    if (paraAdicionar.length) {
      const funcionalidades = await obterFuncionalidadesOrganizacao(evento.organizacaoId)
      if (!funcionalidades.encarregadosHabilitado) return { erro: MSG_FUNCIONALIDADE_DESLIGADA }
      if (func.ativo === false || func.descredenciado_em) return { erro: 'Esta pessoa não está ativa na equipe.' }
      if (func.status_credenciamento !== 'aprovado') return { erro: 'O credenciamento desta pessoa ainda não foi aprovado.' }
      if (!validarCpf(cpf)) return { erro: 'O CPF desta pessoa está inválido no cadastro. Corrija antes de continuar.' }
      if (telefone.length < 10 || telefone.length > 13) {
        return { erro: 'Esta pessoa não tem um WhatsApp válido cadastrado — é por ele que o acesso é enviado.' }
      }
      if (cpf === normalizarCpf((perfil.cpf as string | null) ?? '')) {
        return { erro: 'Você já é responsável por este setor — não precisa ser Encarregado.' }
      }

      if (!perfilId) {
        // CPF sem acesso → cria; já é Encarregado (de outro evento) → reaproveita; outro papel → recusa.
        const { data: existente } = await supabaseAdmin
          .from('perfis').select('id, role, ativo, nome').eq('cpf', cpf).maybeSingle()
        if (existente) {
          if (existente.role !== 'encarregado') {
            return { erro: `Esta pessoa já tem uma função no sistema (${ROLE_LABELS[existente.role as Role] ?? existente.role}). Cada pessoa tem uma função só — por isso ela não pode ser Encarregada.` }
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
           * SEM organização e SEM setor ativo no perfil — de propósito. Quase
           * toda checagem do sistema que não olha o papel cai em "é da mesma
           * organização" ou "é o setor aberto agora"; com os dois em branco,
           * nenhum deles casa. O escopo do Encarregado vive só em `encarregados_setor`.
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
      }

      const { error: erroVinculo } = await supabaseAdmin.from('encarregados_setor').insert(
        paraAdicionar.map(fornecedorId => ({
          perfil_id: perfilId, fornecedor_id: fornecedorId, funcionario_id: funcionarioId,
          permissoes: PERMISSOES_PADRAO, concedido_por: perfil.id, concedido_por_nome: perfil.nome,
        })),
      )
      if (erroVinculo) {
        if (criouAgora && perfilId) {
          await supabaseAdmin.from('perfis').delete().eq('id', perfilId)
          await supabaseAdmin.auth.admin.deleteUser(perfilId).catch(() => {})
        }
        if (ERRO_BANCO_ENCARREGADO.test(erroVinculo.message)) return { erro: AJUDA_MIGRACAO }
        return { erro: mensagemAmigavel(erroVinculo) }
      }
    }

    if (paraRemover.length) {
      const { error: erroRemocao } = await supabaseAdmin
        .from('encarregados_setor').delete().in('id', paraRemover.map(l => l.id as string))
      if (erroRemocao) return { erro: mensagemAmigavel(erroRemocao) }
    }

    // Sem nenhum setor sobrando (em nenhum evento), o login é desativado — não apagado: o histórico fica, e designar de novo reativa.
    if (perfilId) {
      const { count } = await supabaseAdmin
        .from('encarregados_setor').select('id', { count: 'exact', head: true }).eq('perfil_id', perfilId)
      if (!count) await supabaseAdmin.from('perfis').update({ ativo: false }).eq('id', perfilId).eq('role', 'encarregado')
    }

    const nomesDosSetores = (ids: string[]) => ids.map(id => nomeDoSetorComArea(setorPorId.get(id)))
    if (paraAdicionar.length) {
      after(() => registrarAuditoria({
        perfil, acao: 'CONCESSAO_ENCARREGADO', funcionarioId,
        campoAlterado: `Encarregado — ${evento.nome}`,
        valorNovo: `${func.nome} (CPF ${formatCpf(cpf)}): ${nomesDosSetores(paraAdicionar).join(', ')}`,
        eventoId, organizacaoId: evento.organizacaoId ?? undefined,
      }))
    }
    if (paraRemover.length) {
      after(() => registrarAuditoria({
        perfil, acao: 'REMOCAO_ENCARREGADO', funcionarioId,
        campoAlterado: `Encarregado — ${evento.nome}`,
        valorAnterior: `${func.nome}: ${nomesDosSetores(paraRemover.map(l => l.fornecedor_id as string)).join(', ')}`,
        eventoId, organizacaoId: evento.organizacaoId ?? undefined,
      }))
    }

    /*
     * UMA mensagem, com TODOS os setores — só no primeiro acesso da pessoa
     * neste evento. Ela NÃO desfaz o acesso se falhar (ao contrário do
     * supervisor): o template precisa estar aprovado na Meta, e quem foi
     * designado ainda entra por "Esqueci a senha".
     */
    const primeiroAcesso = jaTinha.size === 0 && paraAdicionar.length > 0
    let mensagemEnviada = false
    if (primeiroAcesso && perfilId) {
      const setoresNoTexto = listarEmTexto(nomesDosSetores(escolhidos))
      try {
        const link = await criarConviteSenhaSupervisor({
          perfilId, nome: func.nome as string, cpf, eventoId,
          evento: evento.nome, setor: setoresNoTexto, papel: 'encarregado',
        })
        const mensagemId = await agendarTemplateSupervisor({
          eventoId, telefone,
          template: 'cadastro_encarregado_cpf_link',
          // Ordem do texto: {{1}} nome · {{2}} setor(es), com o subevento · {{3}} evento · {{4}} CPF · {{5}} link
          parametros: [func.nome as string, setoresNoTexto, evento.nome, formatCpf(cpf), link],
        })
        if (mensagemId) after(() => enviarMensagemAgora(mensagemId).catch(e => console.error('[encarregado] envio imediato falhou', e)))
        mensagemEnviada = true
      } catch (e) {
        console.error('[encarregado] mensagem de acesso não agendou', { eventoId, funcionarioId, erro: e })
      }
    }

    revalidatePath('/admin/encarregados')
    return { ok: true, primeiroAcesso, mensagemEnviada, nome: func.nome as string, total: escolhidos.length }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/** Tira a função de Encarregado de TODOS os setores do chamador neste evento. A pessoa continua na equipe. */
export async function removerEncarregado(funcionarioId: string, eventoId: string): Promise<{ ok: true } | { erro: string }> {
  const r = await salvarEncarregado(funcionarioId, eventoId, [])
  return 'erro' in r ? { erro: r.erro } : { ok: true }
}

/**
 * Link novo de criar senha para um Encarregado — "esqueci a senha" resolvido
 * por quem está do lado dele. Master, administrador (da organização) e o
 * supervisor DOS SETORES em que a pessoa é Encarregada podem gerar; é a mesma
 * régua de designar (`escopoDoGestor`), então ninguém mexe em Encarregado de
 * setor que não é seu.
 *
 * NÃO invalida a senha atual (quem lembra continua entrando). O link é de uso
 * único e vale 24h, como todo convite de senha. Com `enviarWhatsApp`, o mesmo
 * link vai também pro WhatsApp cadastrado, pelo modelo de recuperação de senha
 * que já existe e está aprovado.
 */
export async function gerarLinkNovaSenhaEncarregado(
  funcionarioId: string, eventoId: string, enviarWhatsApp = false,
): Promise<{ ok: true; link: string; nome: string; cpf: string; enviado: boolean } | { erro: string }> {
  try {
    const g = await escopoDoGestor(eventoId)
    if (!g.ok) return { erro: g.erro }

    const { data: vinculo } = await supabaseAdmin
      .from('encarregados_setor')
      .select('perfil_id, perfis(nome, cpf, telefone, ativo, role)')
      .eq('funcionario_id', funcionarioId).in('fornecedor_id', g.setores.map(s => s.id)).limit(1).maybeSingle()
    const alvo = vinculo?.perfis as unknown as { nome: string; cpf: string | null; telefone: string | null; ativo: boolean | null; role: string } | null
    if (!vinculo || !alvo || alvo.role !== 'encarregado') {
      return { erro: 'Esta pessoa não é Encarregada de nenhum dos seus setores.' }
    }
    if (alvo.ativo === false) return { erro: 'O acesso desta pessoa está desativado.' }
    const cpf = normalizarCpf(alvo.cpf ?? '')
    if (cpf.length !== 11) return { erro: 'O CPF deste acesso está inválido. Fale com o suporte.' }

    const link = await criarConviteSenhaSupervisor({
      perfilId: vinculo.perfil_id as string, nome: alvo.nome, cpf, eventoId,
      evento: g.evento.nome, setor: 'Encarregado', finalidade: 'recuperacao', papel: 'encarregado',
    })

    let enviado = false
    if (enviarWhatsApp) {
      const telefone = normalizarCpf(alvo.telefone ?? '')
      if (telefone.length < 10 || telefone.length > 13) {
        return { erro: 'O WhatsApp desta pessoa não está válido no cadastro — copie o link e envie por outro canal.' }
      }
      const mensagemId = await agendarTemplateSupervisor({
        eventoId, telefone, template: 'recuperar_senha_cpf_link', parametros: [alvo.nome, link],
      })
      if (mensagemId) after(() => enviarMensagemAgora(mensagemId).catch(e => console.error('[encarregado] link de senha: envio imediato falhou', e)))
      enviado = true
    }

    after(() => registrarAuditoria({
      perfil: g.perfil, acao: 'RESET_SENHA', funcionarioId,
      campoAlterado: 'Link de nova senha — Encarregado',
      valorNovo: `${alvo.nome} — CPF ${formatCpf(cpf)}${enviado ? ' (enviado por WhatsApp)' : ''}`,
      eventoId, organizacaoId: g.evento.organizacaoId ?? undefined,
    }))
    return { ok: true, link, nome: alvo.nome, cpf: formatCpf(cpf), enviado }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}
