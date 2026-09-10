import type { NextConfig } from "next";

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
};

export default nextConfig;
