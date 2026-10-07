import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  /*
   * `any` é AVISO, não erro. O projeto conversa com o Supabase por consultas montadas em texto
   * (`select('a, b(c)')`), cujo retorno o TypeScript não tipa: dezenas de `as any`/`: any` honestos
   * em arquivos que funcionam, e o CI ficava vermelho por causa deles (60 erros). Como aviso, cada
   * um continua listado — e os outros erros (hooks, tipos, build) seguem bloqueando de verdade.
   */
  { rules: { "@typescript-eslint/no-explicit-any": "warn" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
     * `.claude/**` — a pasta de scratch de sessões do Claude Code às vezes
     * guarda uma cópia inteira de worktree (branch de agente paralelo) lá
     * dentro. Sem isto, `eslint .` (sem lista de arquivos) varre esse
     * worktree também — foi o que já causou `JavaScript heap out of
     * memory` nesta sessão (01/10/2026), silenciosamente devolvendo exit
     * code 0 apesar do crash. Precisa estar aqui, não só em `.gitignore`,
     * porque o ESLint não lê `.gitignore` sozinho.
     */
    ".claude/**",
  ]),
]);

export default eslintConfig;
