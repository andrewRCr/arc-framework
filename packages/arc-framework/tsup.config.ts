import { defineConfig } from "tsup";
import { resolve } from "node:path";

import { writeKernelSchemaArtifact } from "./src/lib/kernel/schema/generate.js";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node24",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  // Emit the esbuild metafile so the dev-mode stale-build check can scope
  // staleness to the bundle's real input graph (see lib/dev-check.ts).
  metafile: true,
  onSuccess: async () => {
    await writeKernelSchemaArtifact({ outDir: resolve(import.meta.dirname, "dist") });
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
});
