/** Record the ignore proof and source snapshots without losing any unloaded index groups. */
import type { ProjectionIndex } from "./index-schema.js";
import type { IgnoreCheck } from "./ignore-check.js";

/** Apply the current check's evidence, retaining prior evidence only for a reused pass. */
export function recordProjectionIgnoreCheck(index: ProjectionIndex, ignores: IgnoreCheck): ProjectionIndex {
  return { ...index, ignoreFiles: ignores.kind === "passed" ? [...ignores.records] : ignores.kind === "refused" ? null : index.ignoreFiles,
    ignoreGuard: ignores.kind === "passed" ? ignores.basis : ignores.kind === "refused" ? null : index.ignoreGuard };
}
