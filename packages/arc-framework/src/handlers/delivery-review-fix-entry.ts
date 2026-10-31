/** Authenticated review-fix lifecycle selection and capability-selected delivery entry reads. */
import { readConfigSettings } from "../lib/config/status-reader.js";
import type { GitExec } from "../lib/git/exec.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { raiseNativeResolutionRefusal, resolveActiveWu } from "../lib/release/wu-resolution.js";
import { readCompletedDeliveryLocus, readDeliveryReviewFixTaskInput } from "../lib/store/delivery-review-fix-input.js";
import { inspectRepositoryDeliveryEntry, readInspectionTaskList } from "../lib/delivery/repository-entry.js";
import type { DeliveryEntryInspectionResult } from "../lib/delivery/entry-inspection.js";
import type { ReviewInvocationContext } from "../scripts/review-gate/runtime/invocation.js";
import { resolveNamedReviewWorkUnitInvocation } from "../scripts/review-gate/runtime/review-work-unit.js";
import { resolveCandidateMutationOwner, resolveCompletedCandidateOwners } from "./candidate-mutation-owner.js";

interface ReviewFixWorkUnitLocus { name: string; path: string; branch: string | null; baseBranch: string }

function readCheckoutBranch(cwd: string, exec: GitExec): Promise<string | null> {
  return exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
    cwd, objectAccess: "local-only",
  }).then(({ stdout }) => stdout.trim(), () => null);
}

async function resolveLocus(cwd: string, exec: GitExec, invocation: ReviewInvocationContext): Promise<ReviewFixWorkUnitLocus | null> {
  const [{ settings }, active] = await Promise.all([
    readConfigSettings(cwd),
    resolveActiveWu({ cwd, store: invocation.store, projectId: invocation.projectId }).then(raiseNativeResolutionRefusal),
  ]);
  if (active.status === "resolved" && active.name !== "") return { ...active, baseBranch: settings["branch.base"] };
  const owner = await resolveCandidateMutationOwner({ ...invocation, cwd, exec });
  if (owner.status !== "owned") return null;
  // The checkout's own completed generation, which a live namesake reusing the slug does not withhold.
  if (invocation.store.capabilities.stateOffBranch
    && !(await resolveCompletedCandidateOwners(cwd, invocation.store)).some(({ name }) => name === owner.workUnit)) return null;
  const branch = await readCheckoutBranch(cwd, exec);
  const completed = await readCompletedDeliveryLocus(invocation.store, cwd, owner.workUnit,
    { owner: invocation.workItem, branch, projectId: invocation.projectId });
  if (completed === null) return null;
  if (invocation.workItem === undefined && completed.workItem !== undefined) invocation.workItem = completed.workItem;
  return { ...completed, branch, baseBranch: settings["branch.base"] };
}

/**
 * Bind a delivery command's work unit before any native record access: a completed one by the checkout's branch
 * generation, otherwise the named live one. The repository arm and an already bound invocation are left as they are.
 */
export async function bindDeliveryWorkItem(cwd: string, exec: GitExec, invocation: ReviewInvocationContext,
  workUnitId: string): Promise<void> {
  if (!invocation.store.capabilities.stateOffBranch || invocation.workItem !== undefined) return;
  const completed = await readCompletedDeliveryLocus(invocation.store, cwd, workUnitId,
    { branch: await readCheckoutBranch(cwd, exec), projectId: invocation.projectId });
  const workItem = completed?.workItem
    ?? (await resolveNamedReviewWorkUnitInvocation({ ...invocation, cwd, exec }, workUnitId)).workItem;
  if (workItem !== undefined) invocation.workItem = workItem;
}

async function taskListPath(cwd: string, locus: ReviewFixWorkUnitLocus, invocation: ReviewInvocationContext): Promise<string | null> {
  const stored = await readDeliveryReviewFixTaskInput(invocation.store, cwd, locus, invocation.workItem);
  if (stored.workItem !== undefined) invocation.workItem = stored.workItem;
  return stored.taskListPath;
}

/** Retain one resolved lifecycle owner and bind that exact generation before any native family access. */
export function createDeliveryReviewFixEntry(cwd: string, exec: GitExec, invocation: ReviewInvocationContext): {
  resolveLocus: () => Promise<ReviewFixWorkUnitLocus | null>;
  inspect: (entryMode: "execution" | "integrating") => Promise<DeliveryEntryInspectionResult>;
  readTaskList: (locus: ReviewFixWorkUnitLocus) => Promise<string | null>;
} {
  let pending: Promise<ReviewFixWorkUnitLocus | null> | undefined;
  const readLocus = () => pending ??= resolveLocus(cwd, exec, invocation);
  return {
    resolveLocus: readLocus,
    inspect: async entryMode => {
      const locus = await readLocus();
      if (locus === null) throw new Error("Delivery review-fix work unit unavailable");
      const path = await taskListPath(cwd, locus, invocation);
      if (path === null) throw new Error("Delivery review-fix task list unavailable");
      return inspectRepositoryDeliveryEntry({ ...invocation, cwd, taskListPath: path,
        request: { workUnitId: SlugSchema.parse(locus.name), entryMode }, baseBranch: locus.baseBranch, exec });
    },
    readTaskList: async locus => {
      const path = await taskListPath(cwd, locus, invocation);
      return path === null ? null : readInspectionTaskList({ ...invocation, cwd, taskListPath: path }, invocation.store);
    },
  };
}
