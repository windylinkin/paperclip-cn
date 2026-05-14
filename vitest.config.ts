import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Windows full-suite runs can starve heavy embedded-postgres/worktree suites
    // when Vitest fans out every project at once. A small global cap keeps
    // `pnpm test:run` stable without changing individual suite semantics.
    maxWorkers: process.platform === "win32" ? 4 : undefined,
    projects: [
      "packages/shared",
      "packages/db",
      "packages/adapter-utils",
      "packages/adapters/acpx-local",
      "packages/adapters/claude-local",
      "packages/adapters/codex-local",
      "packages/adapters/cursor-cloud",
      "packages/adapters/cursor-local",
      "packages/adapters/gemini-local",
      "packages/adapters/opencode-local",
      "packages/adapters/pi-local",
      "packages/plugins/sdk",
      "server",
      "ui",
      "cli",
    ],
  },
});
