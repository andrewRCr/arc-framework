/** Read-only terminal previews and apply-authority admission for stored cuts. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import { readWorkUnit } from "../store/lifecycle-write.js";
import { decomposeReadCache } from "./read-cache.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { readDecomposeLandedRetirement } from "./landed.js";
import { prepareDecomposeRetirement } from "./retirement-plan.js";
import { applyDecomposeRetirement } from "./retirement.js";
import { reportDecomposeRetirementPreview, DecomposeFinishAppliedSchema, type DecomposeFinishReport } from "./finish-report.js";
import { decomposeFinishArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

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
  const plan = await prepareDecomposeRetirement(reading, origin);
  if (plan.status === "refused") return plan;
  const preview = reportDecomposeRetirementPreview(plan.result);
  if (options.applyAuthority === undefined) return { status: "ok", result: preview };
  if (options.applyAuthority !== preview.applyAuthority) {
    const argv = decomposeFinishArgv(preview.origin.slug);
    return { status: "refused", reason: "stale-apply-authority", class: "recoverable", locus: "applyAuthority",
      remedy: { text: `Prepare and approve a fresh terminal preview with ${renderV3DecomposeArgv(argv)}.`, argv: [...argv] } };
  }
  const applied = await applyDecomposeRetirement(ctx, plan.result);
  if (applied.status === "refused") return applied;
  return { status: "ok", result: DecomposeFinishAppliedSchema.parse({ kind: "applied", origin: preview.origin,
    members: plan.result.lineage.lineage.successors, notices: applied.result.notices,
    ...(applied.result.outcome.continuation === undefined ? {} : { continuation: applied.result.outcome.continuation }),
  }) };
}
