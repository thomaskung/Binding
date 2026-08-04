import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/app/**/*.tsx",    // UI components — E2E territory
        "src/middleware.ts",    // edge runtime, not testable in node
        "src/lib/supabase/client.ts", // browser-only
        "src/lib/ai/modal.ts", // requires Modal endpoints
        "**/node_modules/**",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
