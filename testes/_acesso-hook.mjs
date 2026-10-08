// Desvia as importações do servidor (banco, 'server-only') para um banco falso em memória — só para os testes.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true }
  if (specifier === './supabase-server') return { url: new URL('./_supabase-falso.mjs', import.meta.url).href, shortCircuit: true }
  if (specifier.startsWith('./') && !/\.[a-z]+$/.test(specifier)) {
    try { return await nextResolve(`${specifier}.ts`, context) } catch { /* cai no padrão */ }
  }
  return nextResolve(specifier, context)
}
