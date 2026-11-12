/** Read-only terminal previews and apply-authority admission for stored cuts. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import { readWorkUnit } from "../store/lifecycle-write.js";
import { decomposeReadCache } from "./read-cache.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { readDecomposeLandedRetirement } from "./landed.js";
import { prepareDecomposeRetirement, type DecomposeRetirementPlan } from "./retirement-plan.js";
import { applyDecomposeRetirement } from "./retirement.js";
import { reportDecomposeRetirementPreview, DecomposeFinishAppliedSchema, type DecomposeFinishReport } from "./finish-report.js";
import { decomposeFinishArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { acquireDecomposeTerminal } from "./acquire-terminal.js";
import { prepareDecomposeExtraction } from "./extraction.js";
import { finishDecomposeExtraction } from "./extraction-finish.js";
import { readDecomposeLandedExtraction } from "./landed-extraction.js";

/** Preview a stored cut, or apply a freshly matched terminal preparation. */
export async function runStoreDecomposeFinish(ctx: DecomposeContext, origin: string,
  options: { applyAuthority?: string } = {}): Promise<DecomposeResult<DecomposeFinishReport>> {
  const store = decomposeReadCache(ctx.executor.store);
  const primary = await readWorkUnit(store, origin);
  if (primary.status === "refused") {
    if (primary.refusal.code !== "not-found") return decomposeStoreRefusal(primary.refusal);
    const landed = await readDecomposeLandedRetirement(store, origin);
    if (landed.status === "refused") return landed;
    if (landed.result !== null) return { status: "ok", result: landed.result };
    return decomposeStoreRefusal(primary.refusal);
  }
  const reading = { ...ctx, executor: { ...ctx.executor, store } };
  const acquired = await acquireDecomposeTerminal(reading, origin);
  if (acquired.status === "refused") return finishAcquisitionRefusal(store, primary.result, acquired);
  if (acquired.result.map.authoring.shape === "extraction") {
    const extraction = await prepareDecomposeExtraction(reading, origin, acquired.result);
    return extraction.status === "refused" ? extraction : finishDecomposeExtraction(ctx, extraction.result, options.applyAuthority);
  }
  const plan = await prepareDecomposeRetirement(reading, origin, acquired.result);
  return plan.status === "refused" ? plan : finishDecomposeRetirement(ctx, plan.result, options.applyAuthority);
}

async function finishAcquisitionRefusal(store: Store, primary: StoreRecord,
  refusal: DecomposeRefusal): Promise<DecomposeResult<DecomposeFinishReport>> {
  if (refusal.reason !== "no-stored-map") return refusal;
  const landed = await readDecomposeLandedExtraction(store, primary);
  if (landed.status === "refused") return landed;
  return landed.result === null ? refusal : { status: "ok", result: landed.result };
}

async function finishDecomposeRetirement(ctx: DecomposeContext, plan: DecomposeRetirementPlan,
  authority?: string): Promise<DecomposeResult<DecomposeFinishReport>> {
  const preview = reportDecomposeRetirementPreview(plan);
  if (authority === undefined) return { status: "ok", result: preview };
  if (authority !== preview.applyAuthority) {
    const argv = decomposeFinishArgv(preview.origin.slug);
    return { status: "refused", reason: "stale-apply-authority", class: "recoverable", locus: "applyAuthority",
      remedy: { text: `Prepare and approve a fresh terminal preview with ${renderV3DecomposeArgv(argv)}.`, argv: [...argv] } };
  }
  const applied = await applyDecomposeRetirement(ctx, plan);
  if (applied.status === "refused") return applied;
  return { status: "ok", result: DecomposeFinishAppliedSchema.parse({ kind: "applied", origin: preview.origin,
    members: plan.lineage.lineage.successors, notices: applied.result.notices,
    ...(applied.result.outcome.continuation === undefined ? {} : { continuation: applied.result.outcome.continuation }),
  }) };
}
