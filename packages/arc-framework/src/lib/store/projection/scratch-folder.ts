/** The claimed work unit's scratch folder, created only through an authorized root and never through a link. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import type { ProjectionRootState } from "./process-state.js";

/**
 * Create a claimed work unit's scratch folder where its root is writable and no ancestor is a symbolic link. The folder is
 * a convenience, so a failure to create it is reported and never stops the caller's publication.
 */
export async function ensureProjectionScratch(root: ProjectionRootState): Promise<void> {
  if (root.claim === null || root.claimKind !== "work-unit") return;
  const path = `.arc/user/${root.identity}/scratch/work-unit/${root.claim}`;
  if (!root.writable(`${path}/`) || (await readProjectionLinkBoundary(root.checkout, [path]))(path) !== null) return;
  await root.context.checkpoint?.();
  try { await mkdir(join(root.checkout, path), { recursive: true }); }
  catch (error) {
    root.context.report?.({ path, copy: null, mark: {
      reason: `Cannot create the scratch folder ${path}: ${error instanceof Error ? error.message : String(error)}`,
      remedy: { text: `Move aside whatever occupies ${path} or restore write access there; the next arc command creates the folder.` } } });
  }
}
