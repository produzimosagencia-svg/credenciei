# Vídeos narrados dos guias

Gera `public/videos/guias/guia-<perfil>.mp4` a partir do HTML do guia (`conteudo/`) e de um roteiro falado (`roteiros.mjs`).

- A voz é a do Gemini TTS (voz `Sulafat`, pt-BR, 0,92x), com a chave `GEMINI_API_KEY` do `.env.local`. Para outra voz: `VOZ_GEMINI=Achird`. Para a voz do macOS: `VOZ=Luciana`. Para uma voz humana de verdade, grave o áudio e troque o .mp4.
- A imagem é a gravação da própria página do guia (Playwright), rolando e clicando nos passos no ritmo da fala.
- `ffmpeg` junta tudo (H.264 + AAC, 960x540).

Como rodar (numa pasta de trabalho fora do projeto, para não pôr dependências no `package.json`):

```
npm i playwright ffmpeg-static
node rodar.mjs <operador|supervisor|encarregado> <nome-do-html-em-conteudo> <saida.mp4>
```

Ajuste o caminho do HTML dentro de `rodar.mjs` (`conteudo/`). Pronúncia: o roteiro escreve "Uatsápi", "cê-pê-éfe" e "Quê Érre Côde" de propósito, para a voz ler certo.
Mudou o texto de um guia? Ajuste o roteiro e gere de novo.
