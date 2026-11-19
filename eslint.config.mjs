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
    // Foundry sources and vendored libs, and the Streams filter that runs in QuickNode's sandbox.
    "contracts/**",
    "quicknode/**",
    // Local scratch that is never committed: the database, one-off scripts, the launch film's own project.
    ".data/**",
  ]),
]);

export default eslintConfig;
