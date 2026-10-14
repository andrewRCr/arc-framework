/** A single version-bound terminal transition, followed by independently retryable checkout/ref cleanup. */
import { recordReferences } from "../../store/identity.js";
import { writeLineageRecord } from "../../store/kinds/lineage/index.js";
import { readLifecycleView } from "../../store/lifecycle-view.js";
import { requireCompleteInventory } from "../../store/lifecycle-storage.js";
import { readWorkUnit } from "../../store/lifecycle-write.js";
import { checkRetiringCheckout, describeRemovalRefusal } from "../../git/worktree-removal.js";
import { findWorkUnitHoldingCheckout } from "./unshared-work.js";
import { executeTransition } from "../lifecycle-executor.js";
import { projectPendingAbandonLifecycle } from "../retirement-lifecycle-result.js";
import { runStoreTeardown } from "./teardown-store.js";
import type { TeardownResult } from "./teardown.js";
import type { AbandonContext, AbandonParams, AbandonResult } from "./abandon.js";
/** Remove the primary with exact terminal links; failure afterward preserves executable cleanup. */
export async function runStoreAbandon(ctx: Pick<AbandonContext, "executor" | "removal" | "storeTeardown" | "baseBranch">, params: AbandonParams): Promise<AbandonResult> {
  const executor = ctx.executor, store = executor.store;
  if (store === undefined) return { status: "rejected", reason: "Store abandonment requires an operational store." };
  try {
    const subject = await abandonmentSubject(ctx, params);
    if (subject.status === "rejected") return subject;
    const { primary, checkout } = subject;
    const name = primary.reference.owner.name;
    const lineage = recordReferences["lineage/transition"](primary.reference.owner);
    const content = writeLineageRecord({ schemaVersion: 2, origin: { name,
      ...(primary.reference.owner.type === "person" || primary.reference.owner.uid === undefined ? {} : { uid: primary.reference.owner.uid }) },
      kind: "abandon", successors: [], incoming: [], retiredBranches: primary.links?.branches ?? [] });
    let cleanup: TeardownResult | undefined;
    const outcome = await executeTransition(executor, { verb: "abandon", slug: name, inputs: { confirmed: true,
      storeTransition: { primary, additionalWrites: [{ action: "put", reference: lineage, expected: null, content }], gitSteps: [{
        name: "retire-checkout-and-created-ref-set", retryCommand: ["arc", "teardown", name],
        run: async () => {
          if (checkout === null && (primary.links?.branches?.length ?? 0) === 0) return;
          if (ctx.storeTeardown === undefined || ctx.baseBranch === undefined) throw new Error("Bind the checkout/ref cleanup boundaries and configured base, then retry teardown.");
          cleanup = await runStoreTeardown({ ...ctx.storeTeardown, store }, { name, base: ctx.baseBranch });
          if (cleanup.status === "rejected") throw new Error(cleanup.reason);
        },
      }] },
    } });
    if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message,
      ...(outcome.status === "rejected" ? { refusal: outcome.refusal, remedy: outcome.remedy } : {}) };
    const branch = primary.links?.branches?.at(-1)?.ref ?? null;
    const lifecycle = projectPendingAbandonLifecycle({ slug: name, branch });
    lifecycle.cleanup = outcome.continuation === undefined ? { branch: { status: "completed" }, worktree: { status: "completed" }, userWorkspace: { status: "not-applicable" } }
      : { branch: { status: "pending" }, worktree: { status: "pending" }, userWorkspace: { status: "not-applicable" } };
    return { status: "abandoned", outcome, lifecycle, notices: cleanup?.status === "torn-down" ? cleanup.notices : [] };
  } catch (error) { return { status: "rejected", reason: error instanceof Error ? error.message : String(error) }; }
}

async function abandonmentSubject(ctx: Pick<AbandonContext, "executor" | "removal" | "storeTeardown">, params: AbandonParams) {
  const store = ctx.executor.store;
  if (store === undefined) throw new Error("Store abandonment requires an operational store.");
  const view = await readLifecycleView(store);
  if (view.status === "refused") return { status: "rejected" as const, reason: view.refusal.condition, refusal: view.refusal };
  requireCompleteInventory(store, view.result.listing);
  const read = await readWorkUnit(store, params.name);
  if (read.status === "refused") return { status: "rejected" as const, reason: read.refusal.condition, refusal: read.refusal };
  const primary = read.result;
  const entry = view.result.entries.find((item) => item.reference.owner.name === primary.reference.owner.name);
  if (entry === undefined) throw new Error("The selected primary is absent from the complete lifecycle view.");
  if (entry.phase === "Integrating") return { status: "rejected" as const, reason: `Withdraw the PR with arc reopen ${entry.reference.owner.name} before abandonment.` };
  if (entry.phase !== "Planning" && entry.phase !== "Active") return { status: "rejected" as const, reason: "Only a stub, Planning, or Active work unit can be abandoned." };
  if (params.confirmed !== true) return { status: "rejected" as const, reason: "Abandonment requires explicit --yes confirmation." };
  const exec = ctx.executor.exec;
  const checkout = exec === undefined ? null : await findWorkUnitHoldingCheckout({ cwd: ctx.executor.cwd, exec, locusPorts: ctx.executor.locusPorts }, primary.reference.owner.name);
  if (checkout !== null && exec !== undefined) {
    const check = await checkRetiringCheckout({ exec, checkoutPath: checkout, ...ctx.removal,
      check: ctx.removal?.check ?? ctx.storeTeardown?.projectionRemovalSlots?.check });
    if (check.kind === "refused") return { status: "rejected" as const, reason: describeRemovalRefusal(check) };
  }
  return { status: "ready" as const, primary, checkout };
}
