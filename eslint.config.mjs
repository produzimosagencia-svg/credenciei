import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
