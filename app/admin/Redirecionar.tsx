'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingConteudo } from '@/components/LogoLoading'

/**
 * Redireciona DEPOIS que a tela já está no navegador — para a porta de
 * entrada do admin (`app/admin/page.tsx`).
 *
 * Por que não `redirect()` do servidor: `/admin` fica dentro do `loading.tsx`
 * (o da raiz e o do admin), então a resposta já começou a ser enviada quando
 * a página decide o destino. Nesse ponto o Next entrega o redirecionamento
 * para o roteador do navegador terminar, e no carregamento completo da página
 * (login → `/admin`) o roteador do Next 16.2 quebrava com o erro #310 do
 * React — a tela "This page couldn't load" que todo supervisor via ao entrar
 * (06/10/2026, reproduzido localmente com o build de produção).
 *
 * Aqui não há corrida: a página hidrata inteira, mostra o carregando e só
 * então navega.
 */
export default function Redirecionar({ para }: { para: string }) {
  const router = useRouter()
  useEffect(() => { router.replace(para) }, [router, para])
  return <LoadingConteudo />
}
