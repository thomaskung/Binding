import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "modal_app/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    "next-env.d.ts",
    "ds-bundle/**",
    ".ds-sync/**",
  ]),
  ...nextCoreWebVitals,
]);
