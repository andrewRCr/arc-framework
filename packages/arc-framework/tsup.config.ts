import { defineConfig } from "tsup";
import { resolve } from "node:path";

import { createKernelRegistry } from "./src/lib/kernel/index.js";
import { writeKernelSchemaArtifact } from "./src/lib/kernel/schema/generate.js";
import { registerReviewDomainSchemas } from "./src/scripts/review-gate/core/register-review-schemas.js";

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
    const registry = registerReviewDomainSchemas(createKernelRegistry());
    await writeKernelSchemaArtifact({
      outDir: resolve(import.meta.dirname, "dist"),
      registry,
    });
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
});
