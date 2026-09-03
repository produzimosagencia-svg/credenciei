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

export const metadata: Metadata = {
  title: "Credenciei",
  description: "Credenciamento de equipes para eventos",
  icons: { icon: "/marca/iso-laranja.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: o script abaixo põe `data-tema` no <html>
    // antes do React hidratar, e o servidor não tinha como saber disso.
    <html lang="pt-BR" className={`h-full ${archivo.variable}`} suppressHydrationWarning>
      <body className="min-h-full">
        {/* Tema claro, se a pessoa escolheu (ver components/Tema.tsx). Roda
            antes da hidratação pra tela não abrir escura e piscar. Só no
            sistema interno: landing, login e telas públicas são sempre
            escuras, então o atributo nem é lido lá. */}
        <Script id="tema-credenciei" strategy="beforeInteractive">
          {"try{var p=location.pathname;if((p.indexOf('/admin')===0||p.indexOf('/scan')===0)&&localStorage.getItem('credenciei-tema')==='claro'){document.documentElement.setAttribute('data-tema','claro')}}catch(e){}"}
        </Script>
        {children}
      </body>
    </html>
  );
}
