import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Buyer reference material and preserved original source — not app code.
    "references/**",
    // Node QA harness (puppeteer/pngjs scripts), not shipped to the browser.
    "qa/**",
  ]),
]);

export default eslintConfig;
