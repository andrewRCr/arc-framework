/** Review work-unit selection retains repository occupancy and exact native primary identities. */
import { resolveActiveWu, type WuResolution } from "../../../lib/release/wu-resolution.js";
import { readReviewWorkUnitByRef } from "../../../lib/store/review-work-unit.js";
import { readWorkUnit } from "../../../lib/store/lifecycle-write.js";
import { unwrapReviewRecordResult } from "../../../lib/store/kinds/review/access-shared.js";
import { resolveReviewInvocation, type ReviewInvocationInput, type ReviewInvocationContext } from "./invocation.js";

/** Keep repository occupancy selection before the flip and use reverse branch lookup on a native store. */
export async function resolveReviewActiveWu(options: ReviewInvocationInput): Promise<WuResolution> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  if (!input.store.capabilities.stateOffBranch) return resolveActiveWu(input);
  const branch = (await input.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: input.cwd })).stdout.trim();
  const selected = await readReviewWorkUnitByRef(input, branch);
  return selected === null ? { status: "none" }
    : { status: "resolved", name: selected.name, path: selected.path, branch: selected.branch };
}

/** Retain the named work unit's exact native primary, preserving absence and an already supplied selection. */
export async function resolveNamedReviewWorkUnitInvocation(options: ReviewInvocationInput,
  name: string): Promise<ReviewInvocationInput & ReviewInvocationContext> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  if (!input.store.capabilities.stateOffBranch || input.workItem !== undefined) return input;
  const read = await readWorkUnit(input.store, name);
  if (read.status === "refused" && read.refusal.code === "not-found") return input;
  return { ...input, workItem: unwrapReviewRecordResult(read).reference.owner };
}
