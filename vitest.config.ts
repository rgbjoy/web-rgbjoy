import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Standalone on purpose: the app's vite.config.ts brings in vinext and the
 * Cloudflare plugin, which build and run a Worker. The tests are plain modules
 * and route handlers, so they run on Node with none of that.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Only exists inside the Workers runtime. Tests get an in-memory stand-in:
      // D1 on Node's SQLite, plus the cache and R2 the server code touches.
      "cloudflare:workers": fileURLToPath(new URL("./tests/cloudflare-env.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
