import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Evento = {
  id: string
  nome: string
  descricao: string | null
  data_inicio: string
  data_fim: string
  local: string | null
  ativo: boolean
  created_at: string
}

export type Fornecedor = {
  id: string
  evento_id: string
  nome: string
  email_contato: string | null
  token_formulario: string
  created_at: string
}

export type Funcionario = {
  id: string
  fornecedor_id: string
  nome: string
  cpf: string
  telefone: string
  email: string
  empresa: string
  cargo: string
  qr_token: string
  created_at: string
}

export type Registro = {
  id: string
  funcionario_id: string
  evento_id: string
  tipo: 'entrada' | 'saida'
  created_at: string
}
