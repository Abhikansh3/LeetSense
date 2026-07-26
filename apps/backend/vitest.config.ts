import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Sets the env vars `src/config/env.ts` validates at import time, and
    // installs the mocks for everything that would otherwise open a socket.
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        // Process entry points: a `listen()` call and signal handlers.
        "src/index.ts",
        "src/worker.ts",
        // Operator scripts, run by hand.
        "src/scripts/**",
        // dotenv side effect only.
        "src/config/load-env.ts",
      ],
    },
  },
});
