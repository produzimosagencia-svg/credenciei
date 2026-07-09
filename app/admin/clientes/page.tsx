import { redirect } from 'next/navigation'

// A gestão de clientes virou gestão de usuários (admin/gerente/supervisor/cliente)
export default function ClientesPage() {
  redirect('/admin/usuarios')
}
