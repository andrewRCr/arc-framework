/** The checkout's per-claim scratch folder, created only through an authorized root and never through a link. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import type { ProjectionRootState } from "./process-state.js";

/** Create the claim's scratch folder where its root is writable and no ancestor is a symbolic link. */
export async function ensureProjectionScratch(root: ProjectionRootState): Promise<void> {
  if (root.claim === null) return;
  const path = `.arc/user/${root.identity}/scratch/work-unit/${root.claim}`;
  if (!root.writable(`${path}/`) || (await readProjectionLinkBoundary(root.checkout, [path]))(path) !== null) return;
  await root.context.checkpoint?.();
  await mkdir(join(root.checkout, path), { recursive: true });
}
