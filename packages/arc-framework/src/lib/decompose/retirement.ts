/** Prepared retirement transitions and independently retryable physical cleanup. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import type { TransitionOutcome } from "../work-unit/lifecycle-executor.js";
import type { DecomposeRetirementPlan } from "./retirement-plan.js";
import { runStoreTeardown } from "../work-unit/verbs/teardown-store.js";
import type { TeardownResult } from "../work-unit/verbs/teardown.js";
import { prepareDecomposeRetirement } from "./retirement-plan.js";
import { readLifecycleView } from "../store/lifecycle-view.js";
import { decomposeInventoryRefusal } from "./acquire-origin.js";
import { executeTransition } from "../work-unit/lifecycle-executor.js";
import { decomposeProvenance } from "./provenance.js";
import { observeRecords } from "../store/record-observations.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeFinishArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

/** A persisted terminal transition with any remaining physical continuation. */
export interface DecomposeRetirementApplied {
  plan: DecomposeRetirementPlan;
  outcome: Extract<TransitionOutcome, { status: "ok" }>;
  notices: readonly string[];
}

/** Prepare and execute a retirement through the lifecycle's atomic store transition. */
export async function runStoreDecomposeRetirement(ctx: DecomposeContext, origin: string): Promise<DecomposeResult<DecomposeRetirementApplied>> {
  const plan = await prepareDecomposeRetirement(ctx, origin);
  return plan.status === "refused" ? plan : applyDecomposeRetirement(ctx, plan.result);
}

/** Apply previously acquired records; revalidation remains the lifecycle executor's responsibility. */
export async function applyDecomposeRetirement(ctx: DecomposeContext, plan: DecomposeRetirementPlan): Promise<DecomposeResult<DecomposeRetirementApplied>> {
  const primary = plan.input.acquired.primary;
  const name = primary.reference.owner.name;
  let cleanup: TeardownResult | undefined;
  const outcome = await executeTransition(ctx.executor, { verb: "decompose", slug: name, inputs: {
    storeTransition: { primary, additionalWrites: [plan.lineage.write, ...plan.recordPlan.writes],
      preparedRecords: plan.records, observations: observeRecords(plan.records), provenance: decomposeProvenance("terminal"),
      gitSteps: [{ name: "retire-checkout-and-created-ref-set", retryCommand: ["arc", "teardown", name], run: async () => {
        if (plan.checkout === null && (primary.links?.branches?.length ?? 0) === 0) return;
        if (ctx.storeTeardown === undefined) throw Error("Bind the checkout/ref cleanup boundaries, then retry teardown.");
        cleanup = await runStoreTeardown({ ...ctx.storeTeardown, store: ctx.executor.store }, { subject: { kind: "slug", slug: name }, base: ctx.baseBranch });
        if (cleanup.status === "rejected") throw Error(cleanup.reason);
      } }] },
  } });
  if (outcome.status !== "ok") {
    if (outcome.status === "rejected" && outcome.stage === "guard") {
      const view = await readLifecycleView(ctx.executor.store);
      if (view.status === "refused") return decomposeStoreRefusal(view.refusal);
      const incomplete = decomposeInventoryRefusal(ctx.executor.store, view.result.listing);
      if (incomplete !== undefined) return incomplete;
    }
    return retirementRejection(name, outcome);
  }
  return { status: "ok", result: { plan, outcome, notices: cleanup?.status === "torn-down" ? cleanup.notices : [] } };
}

function retirementRejection(name: string, outcome: Exclude<TransitionOutcome, { status: "ok" }>): DecomposeRefusal {
  if (outcome.status === "rejected" && outcome.refusal !== undefined && outcome.refusal.code !== "version-conflict") {
    return decomposeStoreRefusal(outcome.refusal);
  }
  const argv = decomposeFinishArgv(name);
  if (outcome.status !== "rejected" || outcome.stage !== "store") return {
    status: "refused", reason: outcome.status === "rejected" && outcome.stage === "git" ? "removal-check" : "origin-state",
    class: "recoverable", locus: name, message: outcome.message,
    remedy: outcome.status === "rejected" && outcome.remedy !== undefined ? outcome.remedy
      : { text: `${outcome.message} Repair this condition, then ${renderV3DecomposeArgv(argv)}.`, argv: [...argv] },
  };
  return { status: "refused", reason: "version-conflict", class: "recoverable", locus: name, message: outcome.message,
    ...(outcome.refusal?.code === "version-conflict" ? { storeRefusal: outcome.refusal } : {}),
    remedy: { text: `Prepare a fresh terminal preview with ${renderV3DecomposeArgv(argv)} and obtain approval again.`, argv: [...argv] } };
}
