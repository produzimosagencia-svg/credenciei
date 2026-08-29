'use server'

import { definirSenhaComConvite } from '@/lib/supervisor-convite'

export type EstadoCriarSenha = {
  ok: boolean
  mensagem: string
}

export async function criarSenhaAction(
  token: string,
  _estado: EstadoCriarSenha,
  formData: FormData,
): Promise<EstadoCriarSenha> {
  const senha = String(formData.get('senha') ?? '')
  const confirmacao = String(formData.get('confirmacao') ?? '')
  if (senha.length < 8) return { ok: false, mensagem: 'Use pelo menos 8 caracteres.' }
  if (senha.length > 128) return { ok: false, mensagem: 'A senha é muito longa.' }
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) {
    return { ok: false, mensagem: 'Inclua pelo menos uma letra e um número.' }
  }
  if (senha !== confirmacao) return { ok: false, mensagem: 'As duas senhas não são iguais.' }

  try {
    await definirSenhaComConvite(token, senha)
    return { ok: true, mensagem: 'Senha criada com sucesso.' }
  } catch (error) {
    return { ok: false, mensagem: error instanceof Error ? error.message : 'Não foi possível criar a senha.' }
  }
}
