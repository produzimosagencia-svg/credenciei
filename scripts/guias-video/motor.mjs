import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
const FF = createRequire(import.meta.url)('ffmpeg-static')
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** segmentos: [{ t: 'texto falado', a: async (p) => {...} }] */
const VOZ_GEMINI = process.env.VOZ_GEMINI || 'Sulafat'
/** Voz natural do Gemini (TTS). A chave vem do .env.local do projeto e nunca é impressa. */
async function sintetizarGemini(texto, pcm, wav) {
  const env = Object.fromEntries(readFileSync('/Users/juanmuzy/Documents/Credenciei/credenciei/.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
  for (let tentativa = 1; tentativa <= 6; tentativa++) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: texto }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ_GEMINI } } } } }),
    })
    const j = await r.json().catch(() => ({}))
    const b64 = j?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
    if (r.ok && b64) {
      writeFileSync(pcm, Buffer.from(b64, 'base64'))
      // um pouco mais devagar (0.92x), sem mudar o tom: mais fácil de acompanhar
      execFileSync(FF, ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcm, '-af', 'atempo=0.92,apad=pad_dur=0.5', '-ar', '44100', wav])
      return
    }
    console.log(`  (TTS ${r.status}, tentativa ${tentativa})`); await sleep(2500 * tentativa)
  }
  throw new Error('o TTS não respondeu: ' + texto.slice(0, 40))
}

export async function produzir({ html, saida, segmentos, voz = 'Luciana', taxa = 150, trabalho }) {
  rmSync(trabalho, { recursive: true, force: true }); mkdirSync(trabalho, { recursive: true })
  // 1) narração: um arquivo por segmento
  const dur = []
  for (const [i, s] of segmentos.entries()) {
    const aiff = `${trabalho}/s${i}.aiff`, wav = `${trabalho}/s${i}.wav`
    if (voz === 'gemini') await sintetizarGemini(s.t, `${trabalho}/s${i}.pcm`, wav)
    else {
      execFileSync('say', ['-v', voz, '-r', String(taxa), '-o', aiff, s.t])
      execFileSync(FF, ['-y', '-loglevel', 'error', '-i', aiff, '-ar', '44100', '-ac', '1', '-af', 'apad=pad_dur=0.45', wav])
    }
    const info = execFileSync('afinfo', [wav]).toString()
    dur.push(parseFloat(info.match(/estimated duration: ([\d.]+)/)[1]))
  }
  writeFileSync(`${trabalho}/lista.txt`, segmentos.map((_, i) => `file 's${i}.wav'`).join('\n'))
  execFileSync(FF, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${trabalho}/lista.txt`, '-c', 'copy', `${trabalho}/audio.wav`])
  const total = dur.reduce((a, b) => a + b, 0)
  console.log(`narração: ${segmentos.length} trechos, ${total.toFixed(1)} s`)

  // 2) gravação da tela, em tempo real, no ritmo da narração
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: `${trabalho}/rec`, size: { width: 1280, height: 720 } }, colorScheme: 'light' })
  const tCtx = Date.now()
  const p = await ctx.newPage()
  await p.setContent(html, { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
  const t0 = Date.now(), deslocamento = (t0 - tCtx) / 1000
  let inicio = 0
  for (let i = 0; i < segmentos.length; i++) {
    const alvo = t0 + (inicio + dur[i]) * 1000
    if (segmentos[i].a) await segmentos[i].a(p).catch(e => console.log('  (ação falhou no trecho', i, e.message.split('\n')[0], ')'))
    const resta = alvo - Date.now(); if (resta > 0) await sleep(resta)
    inicio += dur[i]
  }
  await sleep(700)
  await ctx.close(); await browser.close()
  const webm = readdirSync(`${trabalho}/rec`).find(f => f.endsWith('.webm'))

  // 3) junta imagem e som
  execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', deslocamento.toFixed(2), '-i', `${trabalho}/rec/${webm}`, '-i', `${trabalho}/audio.wav`,
    '-map', '0:v', '-map', '1:a', '-vf', 'scale=960:-2,fps=24', '-c:v', 'libx264', '-crf', '31', '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '56k', '-ac', '1', '-movflags', '+faststart', '-shortest', saida])
  console.log('vídeo:', saida)
}

// ações reutilizáveis
export const A = {
  topo: p => p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })),
  ver: sel => p => p.evaluate(s => { const e = document.querySelector(s); const y = e.getBoundingClientRect().top + scrollY - 70; window.scrollTo({ top: y, behavior: 'smooth' }) }, sel),
  centro: sel => p => p.evaluate(s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); window.scrollTo({ top: r.top + scrollY - (innerHeight - r.height) / 2 + 20, behavior: 'smooth' }) }, sel),
  passo: (tour, n) => async p => { await p.evaluate(([t, k]) => { const tr = document.querySelector(t); const pl = tr.querySelector('[data-ctl="play"]'); if (pl && pl.textContent.trim() === 'Pausar') pl.click(); tr.querySelectorAll('.step')[k].click() }, [tour, n]) },
  aba: id => p => p.evaluate(i => document.querySelector(`[data-tab="${i}"]`).click(), id),
  junta: (...fs) => async p => { for (const f of fs) await f(p) },
}
