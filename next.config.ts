import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.15.123'],
  devIndicators: false,
  /*
   * Protege contra "version skew": a aba aberta rodando o bundle de um deploy
   * antigo, chamando uma Server Action que o servidor novo não conhece mais.
   * O sintoma é justamente o erro mascarado do Next ("An error occurred in the
   * Server Components render…"), sem nada no log — e num dia de trabalho em
   * que sobem vários deploys seguidos, uma tela deixada aberta pega isso
   * fácil.
   *
   * Com um id por deploy, o Next carimba os assets e compara na resposta: se
   * não bate, ele força um recarregamento inteiro em vez de deixar a aba
   * velha falhar. `VERCEL_GIT_COMMIT_SHA` existe no build da Vercel e muda a
   * cada commit; fora dela fica `undefined`, que é o mesmo que não configurar.
   */
  deploymentId: process.env.VERCEL_GIT_COMMIT_SHA,
  experimental: {
    // As fotos de presença são enviadas (comprimidas) via server action
    serverActions: { bodySizeLimit: '5mb' },
  },
};

export default nextConfig;
