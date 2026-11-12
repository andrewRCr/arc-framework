import { defineConfig, type Options } from "tsup";

import { DEV_BUILD_OUTPUT_DIRECTORY_ENV } from "./src/lib/dev-check.js";

/**
 * Shared build options. The runtime-only build in `tsup.fast.config.ts` derives from these rather
 * than restating them, so anything added here reaches both build paths.
 */
const outputDirectory = process.env[DEV_BUILD_OUTPUT_DIRECTORY_ENV] ?? "dist";

export const baseOptions = {
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node24",
  outDir: outputDirectory,
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  // Emit the esbuild metafile so the dev-mode stale-build check can scope
  // staleness to the bundle's real input graph (see lib/dev-check.ts).
  metafile: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
} satisfies Options;

export default defineConfig(baseOptions);
