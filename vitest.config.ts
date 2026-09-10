import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Resolve the "@/..." path alias (from tsconfig) for tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
})
