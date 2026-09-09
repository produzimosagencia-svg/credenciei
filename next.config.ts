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
  },
};

export default nextConfig;
