/** Preview and apply removal of the records created by an in-progress cut. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeDiscardPlan } from "./discard-plan.js";
import type { StoreRefusal } from "../store/refusal.js";
import { DecomposeDiscardPreviewSchema, DecomposeDiscardAppliedSchema, type DecomposeDiscardReport } from "./discard-report.js";
import { prepareDecomposeDiscard } from "./discard-plan.js";
import { decomposeApplyAuthority } from "./apply-authority.js";
import { decomposeRemovalReferences } from "./removal-records.js";
import { sortByCanonicalBytes } from "../kernel/canonical/canonical-json.js";
import { decomposeDiscardArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { revalidateLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
import { batchLifecycleWrites } from "../store/lifecycle-write.js";
import { decomposeProvenance } from "./provenance.js";
import { observeRecords } from "../store/record-observations.js";

/** Remove an approved cut's member groups, new cohort documents, and stored map. */
export async function runStoreDecomposeDiscard(ctx: DecomposeContext, origin: string,
  options: { applyAuthority?: string } = {}): Promise<DecomposeResult<DecomposeDiscardReport>> {
  const prepared = await prepareDecomposeDiscard(ctx, origin);
  if (prepared.status === "refused") return prepared;
  const plan = prepared.result;
  const details = { origin: { slug: plan.primary.reference.owner.name, uid: plan.map.machine.origin.uid },
    removals: sortByCanonicalBytes(decomposeRemovalReferences(plan.writes)), leftEdited: plan.leftEdited };
  const applyAuthority = decomposeApplyAuthority({ mode: "discard", origin: details.origin, records: plan.records, writes: plan.writes });
  if (options.applyAuthority === undefined) return { status: "ok", result: DecomposeDiscardPreviewSchema.parse({
    kind: "preview", mode: "discard", ...details, applyAuthority, writes: sortByCanonicalBytes(plan.writes) }) };
  if (options.applyAuthority !== applyAuthority) return { status: "refused", reason: "stale-apply-authority", class: "recoverable",
    locus: "applyAuthority", remedy: freshDiscardRemedy(details.origin.slug) };
  const valid = await revalidateLifecycleRecords(ctx.executor.store, plan.records);
  if (valid.status === "refused") return discardRejection(plan, valid.refusal);
  const applied = await batchLifecycleWrites(ctx.executor.store, plan.writes, decomposeProvenance("discard"), observeRecords(plan.records));
  return applied.status === "refused" ? discardRejection(plan, applied.refusal)
    : { status: "ok", result: DecomposeDiscardAppliedSchema.parse({ kind: "discarded", ...details }) };
}

function freshDiscardRemedy(origin: string) {
  const argv = decomposeDiscardArgv(origin);
  return { text: `Prepare a fresh discard preview with ${renderV3DecomposeArgv(argv)} and obtain approval again.`, argv: [...argv] };
}

function discardRejection(plan: DecomposeDiscardPlan, refusal: StoreRefusal): DecomposeResult<never> {
  return refusal.code === "version-conflict" ? { status: "refused", reason: "version-conflict", class: "recoverable",
    locus: plan.primary.reference.owner.name, message: refusal.condition, storeRefusal: refusal,
    remedy: freshDiscardRemedy(plan.primary.reference.owner.name) } : decomposeStoreRefusal(refusal);
}
