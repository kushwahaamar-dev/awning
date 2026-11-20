import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The tests reach the app's modules by the same "@/" the app does.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { testTimeout: 15_000 },
});
