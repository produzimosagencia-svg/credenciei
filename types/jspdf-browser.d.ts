/**
 * Declaração mínima pro caminho explícito do build de navegador do jsPDF.
 *
 * Usado só em app/admin/whatsapp/pdfCustoWhatsApp.ts, pra contornar a
 * condição `exports` ambígua (node/browser) do pacote — ver o comentário
 * lá. O TIPO de verdade vem do pacote `jspdf` normal (import type); esta
 * declaração só existe pra o TypeScript aceitar o caminho profundo do
 * import em runtime, sem reclamar de "implicitly has an any type".
 */
declare module 'jspdf/dist/jspdf.es.min.js' {
  export * from 'jspdf'
}
