import { redirect } from 'next/navigation'
import { Settings, Check, Minus, Construction } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import {
  ROLE_LABELS, ehMaster, veTodosEventos, podeGerenciarOrganizacoes, podeGerenciarUsuarios,
  podeGerenciarEventos, podeExcluir, podeEditarIdentidade, podeEscanear, podeAcompanhar,
  type Role,
} from '@/lib/permissions'
import { PageHeader, Secao, Aviso } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * Configurações — onde a plataforma vai liberar funcionalidade por tipo de
 * acesso.
 *
 * AINDA NÃO EDITA NADA, de propósito. O que está aqui é a régua REAL de
 * hoje, lida das próprias funções de `lib/permissions.ts` — não uma tabela
 * escrita à mão que envelheceria na primeira mudança de regra. Enquanto os
 * interruptores não existem, ao menos a pergunta "quem pode o quê" tem uma
 * resposta única e confiável no sistema, em vez de estar espalhada em
 * dezenas de `if` pelo código.
 *
 * Botão que não faz nada é pior que botão nenhum: quem clica acredita que
 * mudou, e a regra continua a mesma. Por isso nenhum controle falso aqui.
 *
 * ── O que vem depois (decidido com o Juan em 02/09/2026) ──
 *
 * Tornar estas células editáveis, gravando numa tabela de permissões por
 * organização, com `lib/permissions.ts` passando a consultá-la em vez de
 * decidir por `role` fixo. E criar o papel de SUPORTE — apoio no dia do
 * evento, que corrige cadastro e move gente entre setores sem ser dono da
 * conta — que terá acesso a esta tela junto com o master. O gancho já
 * existe: `podeEditarIdentidade` é o único lugar a mudar para incluí-lo.
 */

const PAPEIS: Role[] = ['master', 'admin', 'supervisor', 'operador_portao']

const CAPACIDADES: { nome: string; descricao: string; tem: (r: string) => boolean }[] = [
  { nome: 'Ver todos os eventos', descricao: 'Enxerga eventos de todas as organizações, não só da própria', tem: veTodosEventos },
  { nome: 'Gerenciar organizações', descricao: 'Cria e suspende organizações, define limites de evento', tem: podeGerenciarOrganizacoes },
  { nome: 'Gerenciar eventos', descricao: 'Cria e edita evento, setor, equipe, avisos e a batida do meio', tem: podeGerenciarEventos },
  { nome: 'Gerenciar acessos', descricao: 'Cria e edita quem entra no sistema (supervisores, operadores)', tem: podeGerenciarUsuarios },
  { nome: 'Escanear QR', descricao: 'Lê a credencial no portão e registra entrada e saída', tem: podeEscanear },
  { nome: 'Acompanhar a operação', descricao: 'Atividades, pendências, histórico e registro de ponto assistido', tem: podeAcompanhar },
  { nome: 'Corrigir CPF', descricao: 'Conserta identidade já cadastrada sem a pessoa refazer o cadastro', tem: podeEditarIdentidade },
  { nome: 'Excluir', descricao: 'Apaga em cascata e sem desfazer — evento, setor, pessoa, organização', tem: podeExcluir },
]

export default async function ConfiguracoesPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!ehMaster(perfil.role)) redirect('/admin')

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Configurações"
        descricao="O que cada tipo de acesso pode fazer no sistema"
      />

      <Aviso tom="atencao" icone={<Construction className="w-3.5 h-3.5" />}>
        <strong>Em construção.</strong> Por enquanto esta tela só <em>mostra</em> a régua — nada aqui é
        editável ainda. A tabela é lida das regras que o sistema de fato aplica, então ela nunca fica
        desatualizada. O próximo passo é ligar e desligar estas células por organização, e criar o
        acesso de <strong>suporte</strong>, que vai entrar aqui junto com o master.
      </Aviso>

      <Secao
        tom="acento"
        icone={<Settings className="w-3.5 h-3.5" />}
        titulo="Permissões por tipo de acesso"
        descricao="Como está hoje, valendo agora mesmo em todas as telas"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-2xs uppercase tracking-wide border-b border-slate-100">
                <th className="text-left font-semibold px-4 py-2.5">Funcionalidade</th>
                {PAPEIS.map(p => (
                  <th key={p} className="text-center font-semibold px-4 py-2.5 whitespace-nowrap">{ROLE_LABELS[p]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPACIDADES.map(c => (
                <tr key={c.nome} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <p className="text-slate-800 font-medium">{c.nome}</p>
                    <p className="text-slate-400 text-xs">{c.descricao}</p>
                  </td>
                  {PAPEIS.map(p => (
                    <td key={p} className="px-4 py-2.5 text-center">
                      {c.tem(p)
                        ? <Check className="w-4 h-4 text-green-600 mx-auto" aria-label="pode" />
                        : <Minus className="w-4 h-4 text-slate-200 mx-auto" aria-label="não pode" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>
    </div>
  )
}
