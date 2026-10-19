/** Review branch resolution preserves repository occupancy behavior before the storage flip. */
import { resolveActiveWu, type WuResolution } from "../../../lib/release/wu-resolution.js";
import { readReviewWorkUnitByRef } from "../../../lib/store/review-work-unit.js";
import { resolveReviewInvocation, type ReviewInvocationInput } from "./invocation.js";

/** Keep repository occupancy selection before the flip and use reverse branch lookup on a native store. */
export async function resolveReviewActiveWu(options: ReviewInvocationInput): Promise<WuResolution> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  if (!input.store.capabilities.stateOffBranch) return resolveActiveWu(input);
  const branch = (await input.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: input.cwd })).stdout.trim();
  const selected = await readReviewWorkUnitByRef(input, branch);
  return selected === null ? { status: "none" }
    : { status: "resolved", name: selected.name, path: selected.path, branch: selected.branch };
}
