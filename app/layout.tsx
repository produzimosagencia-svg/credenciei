import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Credenciei",
  description: "Sistema de credenciamento para eventos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
