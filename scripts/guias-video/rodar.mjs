import { readFileSync } from 'node:fs'
import { produzir } from './motor.mjs'
import * as roteiros from './roteiros.mjs'
const [, , chave, arquivo, saida] = process.argv
const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync(`/Users/juanmuzy/Documents/Credenciei/credenciei/conteudo/${arquivo}.html`, 'utf8') + '</body></html>'
await produzir({ html, saida, trabalho: `/tmp/captura/video/w-${chave}`, segmentos: roteiros[chave] })
