/** Observe exact Errand head and base coordinates without selecting checkout occupancy. */
import { resolveSoleMergeBase } from "../../../lib/git/base-overlap.js";
import type { GitExec } from "../../../lib/git/exec.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";

/** Read the exact review coordinates when status established its current base. */
export async function currentErrandDiffBase(
  exec: GitExec,
  headSha: string,
  baseOid: string | undefined,
  baseRef: string | undefined,
): Promise<Pick<ReviewTarget, "baseRef" | "diffBaseSha" | "diffBaseTree" | "headSha" | "headTree"> | null> {
  if (baseOid === undefined || baseRef === undefined) return null;
  const diffBase = await resolveSoleMergeBase({ exec, leftRevision: headSha, rightRevision: baseOid });
  if (diffBase.status !== "resolved") return null;
  const tree = async (revision: string) => (await exec("git", ["rev-parse", "--verify", `${revision}^{tree}`])).stdout.trim();
  return { baseRef, diffBaseSha: diffBase.mergeBase, headSha,
    diffBaseTree: await tree(diffBase.mergeBase), headTree: await tree(headSha) };
}
