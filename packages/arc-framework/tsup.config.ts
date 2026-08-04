import { defineConfig, type Options } from "tsup";
import { resolve } from "node:path";

import { writeDevBuildStamp } from "./src/lib/dev-check.js";
import { registerDeliveryDomainSchemas } from "./src/lib/delivery/schema.js";
import { createKernelRegistry } from "./src/lib/kernel/index.js";
import { writeKernelSchemaArtifact } from "./src/lib/kernel/schema/generate.js";
import { registerReviewDomainSchemas } from "./src/scripts/review-gate/core/register-review-schemas.js";

/**
 * Shared build options. The runtime-only build in `tsup.fast.config.ts` derives from these rather
 * than restating them, so anything added here reaches both build paths.
 */
export const baseOptions = {
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
    const pkgDir = import.meta.dirname;
    const outDir = resolve(pkgDir, "dist");
    const registry = registerDeliveryDomainSchemas(registerReviewDomainSchemas(createKernelRegistry()));
    await writeKernelSchemaArtifact({
      outDir,
      registry,
    });
    // Content-hash stamp for the runtime stale-build guard — mtime alone
    // false-positives when tools bump timestamps without editing sources.
    writeDevBuildStamp(outDir, pkgDir);
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
} satisfies Options;

export default defineConfig(baseOptions);
