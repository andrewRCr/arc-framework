/** Immutable local subjects for changeset sizing without changing checkout refs or the real index. */

import { stagedIndexTree, stagedWorktreeTree } from "../../../lib/checks/tree.js";
import type { GitExec, RawGitExec } from "../../../lib/git/exec.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ReviewChunkingResolveRequest } from "../core/review-chunking-command-schema.js";
import { deriveLocalReviewTargetFromCoordinates } from "../hosts/local/repository-target.js";
import { ReviewChunkingCommandError } from "./review-chunking-command.js";

/** Derive an exact commit target, optionally capturing current index or working-tree content. */
export async function deriveReviewChunkingSubject(input: {
  exec: GitExec;
  raw: RawGitExec;
  cwd: string;
  repositoryId: string;
  request: Pick<ReviewChunkingResolveRequest, "target" | "localSubject">;
}): Promise<ReviewTarget> {
  const derive = (coordinates: ReviewChunkingResolveRequest["target"]) =>
    deriveLocalReviewTargetFromCoordinates({ ...input, coordinates });
  const target = await derive(input.request.target);
  if (input.request.localSubject === undefined) return target;
  const requireCurrentHead = async () => {
    const { stdout } = await input.exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: input.cwd });
    if (stdout.trim() !== target.headSha) {
      throw new ReviewChunkingCommandError(
        "Local sizing requires target.headSha to match current HEAD; refresh the anchor and retry.",
      );
    }
  };
  await requireCurrentHead();
  const tree = input.request.localSubject === "index"
    ? await stagedIndexTree(input.exec, input.cwd)
    : await stagedWorktreeTree(input.exec, input.cwd);
  await requireCurrentHead();
  if (tree === target.headTree) return target;

  // Fixed metadata keeps repeated snapshots of the same content and parent identical. The unattached object
  // provides ordinary commit coordinates to existing sizing policy without advancing any branch or review state.
  const identity = "ARC review snapshot <snapshot@arc.invalid> 0 +0000";
  const commit = `tree ${tree}\nparent ${target.headSha}\nauthor ${identity}\ncommitter ${identity}\n\nLocal sizing snapshot\n`;
  const { stdout } = await input.raw(["hash-object", "-t", "commit", "-w", "--stdin"], {
    cwd: input.cwd, input: new TextEncoder().encode(commit),
  });
  return derive({ ...input.request.target, headSha: new TextDecoder().decode(stdout).trim() });
}
