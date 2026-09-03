import type { Metadata } from "next";
import { Archivo } from "next/font/google";
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
    <html lang="pt-BR" className={`h-full ${archivo.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
