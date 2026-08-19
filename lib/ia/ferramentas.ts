/**
 * Ferramentas do Suporte — porta de entrada.
 *
 * A implementação vive em `ferramentas/`, um módulo por assunto. Este arquivo
 * só junta tudo e reexporta os tipos, para que `agente.ts` e a rota da API não
 * precisem saber como as ferramentas estão organizadas por dentro.
 *
 * DUAS TRAVAS SUSTENTAM TODO O RESTO, e nenhuma delas está no prompt:
 *
 * 1. **Permissão** — cada ferramenta refaz a checagem de escopo (organização
 *    do admin, setor do supervisor) antes de ler ou escrever. O modelo não
 *    "recebe" um nível de acesso; ele bate na mesma porta que a tela bate.
 *
 * 2. **Confirmação** — ação de risco devolve `precisa_confirmar` na primeira
 *    chamada e só executa quando o id da operação aparece em `confirmacoes`.
 *    Essa lista chega no corpo da requisição, preenchida pelo CLIQUE da pessoa
 *    na interface. A IA pode pedir a exclusão à vontade; ela não tem como se
 *    autorizar.
 */
import { criarPedirConfirmacao, type ContextoIA } from './ferramentas/base'
import { ferramentasDeConsulta } from './ferramentas/consultas'
import { ferramentasDeEvento } from './ferramentas/eventos'
import { ferramentasDeSetor } from './ferramentas/setores'
import { ferramentasDeFuncionario } from './ferramentas/funcionarios'
import { ferramentasDeUsuario } from './ferramentas/usuarios'
import { ferramentasDeWhatsapp } from './ferramentas/whatsapp'

export type {
  PerfilIA,
  PedidoConfirmacao,
  ContextoIA,
  Ferramenta,
} from './ferramentas/base'

export function ferramentasPara(ctx: ContextoIA) {
  const pedirConfirmacao = criarPedirConfirmacao(ctx)
  return [
    ...ferramentasDeConsulta(ctx),
    ...ferramentasDeEvento(ctx, pedirConfirmacao),
    ...ferramentasDeSetor(ctx, pedirConfirmacao),
    ...ferramentasDeFuncionario(ctx, pedirConfirmacao),
    ...ferramentasDeUsuario(ctx, pedirConfirmacao),
    ...ferramentasDeWhatsapp(ctx, pedirConfirmacao),
  ]
}
