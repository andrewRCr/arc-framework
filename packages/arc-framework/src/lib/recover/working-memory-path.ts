/** Address-only projection for the recovery load set's personal memory record. */
import type { GitExec } from "../git/exec.js";
import type { Slug } from "../kernel/index.js";
import { resolvePrimaryWorktreePath } from "../git/worktree-roster.js";
import { materializeArcPath, resolveArcPath } from "../layout/index.js";

/** Preserve the primary-checkout display address independently of record content reads.
 * @param input - Recovering checkout, selected person and local Git topology.
 * @returns Absolute WORKING-MEMORY address used in recovery manifests.
 */
export async function resolveRecoveryWorkingMemoryPath(input: { cwd: string; identity: Slug; exec: GitExec }): Promise<string> {
  const root = await resolvePrimaryWorktreePath(input.exec) ?? input.cwd;
  return materializeArcPath(root, resolveArcPath({ kind: "user-document", identity: input.identity,
    document: { kind: "working-memory" } }));
}
