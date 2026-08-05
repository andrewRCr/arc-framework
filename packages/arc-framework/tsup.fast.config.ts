import { defineConfig, type Options } from "tsup";

import { baseOptions } from "./tsup.config.js";

/**
 * Runtime-only build: the shared options minus the declaration emit, which nothing here consumes —
 * the package declares no `types`, `main`, or `exports` entry, and the CLI loads only the bundle.
 *
 * Everything else is inherited rather than restated, so the artifacts the freshness check and the
 * end-to-end setup read stay regenerated: the esbuild metafile that scopes the hashed input set, the
 * output clean, and the success hook that writes the kernel schema artifact and the content-hash
 * stamp. The clean also drops declarations a prior full build left behind — tsup preserves those
 * only while declaration emit is on, and nothing reads them.
 */
export const fastOptions = {
  ...baseOptions,
  dts: false,
} satisfies Options;

export default defineConfig(fastOptions);
