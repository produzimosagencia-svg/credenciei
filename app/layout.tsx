import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter com feature de números tabulares e o "a" de cauda reta (cv11) — os
// mesmos ajustes que Linear e Vercel usam. Sem isso a Inter renderiza com o
// desenho padrão, que é o que se vê em qualquer landing page de template.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Credenciei",
  description: "Sistema de credenciamento para eventos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`h-full ${inter.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
