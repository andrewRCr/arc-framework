import { defineConfig, type Options } from "tsup";
import { resolve } from "node:path";

import {
  DEV_BUILD_OUTPUT_DIRECTORY_ENV,
  writeDevBuildStamp,
} from "./src/lib/dev-check.js";
import { writeKernelSchemaArtifact } from "./src/lib/kernel/schema/generate.js";
import { createProductionSchemaRegistry } from "./src/production-schema-registry.js";

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
  onSuccess: async () => {
    const pkgDir = import.meta.dirname;
    const outDir = resolve(pkgDir, outputDirectory);
    await writeKernelSchemaArtifact({
      outDir,
      registry: createProductionSchemaRegistry(),
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
