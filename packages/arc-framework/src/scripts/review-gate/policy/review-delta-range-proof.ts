/** Git proof of a linear review range after a converged predecessor. */
import type { GitExec } from "../../../lib/git/exec.js";
import { readCheckMerges } from "../../../lib/checks/merged.js";
import { readAncestry } from "../../../lib/work-unit/git-decomposition-object-readers.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ReviewNextPassContext } from "./review-next-pass-schema.js";

/** Prove a changed, merge-free descendant range while preserving the exact review base. */
export async function proveReviewDeltaRange(input: {
  readonly predecessor: ReviewTarget;
  readonly current: ReviewTarget;
  readonly convergence: ReviewNextPassContext["convergence"];
  readonly cwd: string;
  readonly exec: GitExec;
}): Promise<boolean> {
  const { predecessor, current } = input;
  if (input.convergence !== "converged" || predecessor.headSha === current.headSha
    || predecessor.baseRef !== current.baseRef || predecessor.diffBaseSha !== current.diffBaseSha
    || predecessor.diffBaseTree !== current.diffBaseTree) return false;
  const git: GitExec = (command, args, options) => input.exec(command, args, { ...options, cwd: input.cwd });
  try {
    if (await readAncestry(git, predecessor.headSha, current.headSha) !== "ancestor") return false;
    return (await readCheckMerges(git, input.cwd, predecessor.headSha, current.headSha)).length === 0;
  } catch {
    return false;
  }
}
