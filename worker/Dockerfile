# Build context: RAIZ do repositório (não a pasta worker/) — o worker
# importa lib/mensagens.ts e lib/evolution.ts direto do app principal, sem
# duplicar código. No EasyPanel: "Build Context" = raiz do repo,
# "Dockerfile Path" = worker/Dockerfile.
FROM node:22-alpine
WORKDIR /app

COPY worker/package.json ./package.json
RUN npm install --omit=dev

COPY lib ./lib
COPY worker ./worker

CMD ["npx", "tsx", "worker/index.ts"]
