import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Archivo em 400/600/800: o design "Arena" é todo nela — corpo em 400, os
// títulos e os números grandes em 800. É o peso 800 que dá a cara de
// painel de arena; sem ele o Archivo vira só mais uma grotesca.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-archivo",
  display: "swap",
});

/*
 * Sem `icons` aqui de propósito: os ícones vêm dos arquivos
 * `app/favicon.ico`, `app/icon.png` e `app/apple-icon.png` (convenção do
 * App Router), gerados a partir de public/marca/iso-laranja.png já
 * QUADRADOS e centralizados.
 *
 * Apontar o metadata direto pro asset da marca parecia equivalente, mas
 * ele é 512x496 — o navegador espremia o símbolo pra caber num quadrado.
 * E, com as duas fontes declaradas ao mesmo tempo, qual das duas o
 * navegador escolhia era loteria.
 */
export const metadata: Metadata = {
  title: "Credenciei",
  description: "Credenciamento de equipes para eventos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: o script abaixo põe `data-tema` no <html>
    // antes do React hidratar, e o servidor não tinha como saber disso.
    <html lang="pt-BR" className={`h-full ${archivo.variable}`} suppressHydrationWarning>
      <body className="min-h-full">
        {/* Tema (ver components/Tema.tsx): o CLARO é o padrão, e só fica escuro quem escolheu
            escuro (localStorage vazio ou bloqueado também dá claro). Roda antes da hidratação
            pra tela não abrir de um jeito e piscar pro outro. Vale no sistema interno e na landing (`/`,
            desde 09/10/2026); login e telas públicas continuam sempre escuros. */}
        <Script id="tema-credenciei" strategy="beforeInteractive">
          {"var p=location.pathname;if(p==='/'||p.indexOf('/admin')===0||p.indexOf('/scan')===0||p.indexOf('/encarregado')===0){var t=null;try{t=localStorage.getItem('credenciei-tema')}catch(e){}if(t!=='escuro')document.documentElement.setAttribute('data-tema','claro')}"}
        </Script>
        {children}
      </body>
    </html>
  );
}
