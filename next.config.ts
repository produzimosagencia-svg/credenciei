import type { NextConfig } from "next";

const cabecalhosComuns = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.15.123'],
  devIndicators: false,
  /*
   * NÃO configurar `deploymentId` aqui. A Vercel já injeta
   * `NEXT_DEPLOYMENT_ID` no build (skew protection ligada no projeto), e um
   * valor próprio na config não soma: o build falha com "The
   * NEXT_DEPLOYMENT_ID environment variable value … does not match the
   * provided deploymentId" — foi o que aconteceu no deploy do commit 9f330a0,
   * em 09/09/2026. Ou seja: a proteção contra aba desatualizada já existe, e
   * uma Server Action que falha aqui está falhando de verdade, não por deploy
   * antigo.
   */
  // O guia do supervisor é lido do disco por uma rota (fs em tempo de execução): sem isto a
  // Vercel não sabe que o arquivo faz parte do deploy e ele some do build.
  outputFileTracingIncludes: {
    '/guia-supervisor': ['./conteudo/guia-supervisor.html'],
    '/guia-operador': ['./conteudo/guia-operador-portao.html'],
    '/guia-encarregado': ['./conteudo/guia-encarregado.html'],
  },
  experimental: {
    // As fotos de presença são enviadas (comprimidas) via server action
    serverActions: { bodySizeLimit: '5mb' },
    /*
     * Cache de navegação no CLIENTE (Router Cache).
     *
     * O Next 16 zera isto por padrão (`dynamic: 0` desde a v15): todo segmento
     * de página com `revalidate = 0` — que aqui é toda tela do admin — é
     * rebuscado no servidor A CADA navegação, mesmo voltar pra uma tela aberta
     * segundos atrás. É o "refaz tudo do zero" ao ir Eventos → Backlog →
     * Eventos.
     *
     * `dynamic: 30` faz o cliente reaproveitar o RSC já carregado por 30s: a
     * volta é instantânea, e o skeleton (loading.tsx) prefetchado gruda pelo
     * período `static`. NÃO afeta dado após mutação — Server Action que chama
     * `revalidatePath` continua furando este cache na hora. É janela de
     * staleness só em navegação passiva, e telas de painel toleram 30s.
     */
    staleTimes: { dynamic: 30, static: 180 },
  },
  /*
   * Headers de segurança (auditoria de 01/10/2026 — item "Add security
   * headers", único dos 20 que era uma lacuna real de config, não de
   * arquitetura). Deliberadamente SEM Content-Security-Policy aqui: uma CSP
   * mal calibrada quebra o site inteiro (login, scanner, formulário
   * público) pra todo mundo na hora, e calibrar uma direito pede testar ao
   * vivo contra cada recurso externo que o app carrega — fica pra uma
   * passada dedicada, não pra mexer "de passagem".
   *
   * Permissions-Policy libera câmera/microfone/geolocalização só pra
   * `self`: o scanner de QR, a biometria facial (câmera), o check-in do
   * meio do turno (geolocalização) e a transcrição de áudio de gastos
   * (microfone) são tudo PRÓPRIO do site — a política só fecha a porta pra
   * um iframe de terceiro tentar usar essas APIs às custas do Credenciei.
   */
  async headers() {
    return [
      {
        // Tudo é DENY (ninguém embute o Credenciei), exceto o guia do supervisor, que a
        // tela "Tutorial supervisor" mostra num iframe do MESMO site (ver o bloco abaixo).
        source: '/:path((?!guia-(?:supervisor|operador|encarregado)$).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          ...cabecalhosComuns,
        ],
      },
      {
        source: '/guia-supervisor',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          ...cabecalhosComuns,
        ],
      },
      {
        source: '/guia-operador',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          ...cabecalhosComuns,
        ],
      },
      {
        source: '/guia-encarregado',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          ...cabecalhosComuns,
        ],
      },
    ]
  },
};

export default nextConfig;
