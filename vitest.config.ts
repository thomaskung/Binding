import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.ts",
        "src/lib/ai/**/*.ts",
        "src/lib/supabase/*.ts",
        "src/app/onboarding/actions.ts",
        "src/app/(app)/training/actions.ts",
        "src/app/(app)/account/actions.ts",
      ],
      exclude: [
        // infrastructure / browser-only
        "src/lib/supabase/client.ts",
        "src/lib/ai/modal.ts",
        "src/lib/ai/types.ts",        // type-only
        "src/lib/ai/index.ts",        // trivial switch
        // UI — E2E territory
        "src/app/**/*.tsx",
        "src/middleware.ts",
        "**/node_modules/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
