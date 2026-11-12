/** Prepared personal-reference command binding over one selected Store and the existing notes lock. */
import type { Store } from "../lib/store/contract.js";
import type { StoreRefusal } from "../lib/store/refusal.js";
import type { GitExec } from "../lib/git/exec.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../lib/advisory-lock.js";
import { getNotesLockPath } from "../lib/user-sync/notes-lock.js";
import { createStoreUserReferencePrepareContext } from "../lib/user-reference-reconcile-store.js";
import { runUserReferenceReconcile, type UserReferenceEvidenceAuthorityResult,
  type UserReferenceReconcilePlan } from "../lib/user-reference-reconcile.js";
/** Command facts shared by human and JSON presentation. */
export interface StoreUserReferenceCommandResult {
  status: string; authority: UserReferenceEvidenceAuthorityResult; plan: UserReferenceReconcilePlan | null; refusal?: StoreRefusal;
}
/** Prepare once, then validate and apply under the same lock as scratch moves. */
export async function runStoreUserReferenceReconcileCommand(input: {
  store: Store; cwd: string; identity: string; exec: GitExec; workUnit?: string; apply: boolean;
}): Promise<StoreUserReferenceCommandResult> {
  const acquired = await createStoreUserReferencePrepareContext(input);
  if (acquired.status === "refused") return { status: "unavailable", plan: null, refusal: acquired.refusal,
    authority: { status: "unavailable", ref: "store", reason: "state-unavailable", remoteEvidence: "not-applicable",
      condition: acquired.refusal.condition, remedy: acquired.refusal.remedy } };
  const lockPath = await getNotesLockPath(input.exec, input.cwd, input.identity);
  const prepared = acquired.result;
  const result = await runUserReferenceReconcile({ preparedStore: prepared.preparedStore,
    transitions: prepared.authority.transitions, apply: input.apply,
    scratch: { cwd: input.cwd, identity: input.identity, store: input.store },
    readSurfaces: () => Promise.resolve(prepared.surfaces),
    acquireLock: () => acquireAdvisoryLock(lockPath),
    releaseLock: handle => releaseAdvisoryLock(handle as Awaited<ReturnType<typeof acquireAdvisoryLock>>),
  });
  return { status: result.status, authority: prepared.authority, plan: result.plan,
    ...(result.status === "refused" ? { refusal: result.refusal } : {}) };
}
