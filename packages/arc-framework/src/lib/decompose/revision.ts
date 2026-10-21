/** Preview and apply the difference between stored and newly authored cut maps. */
import type { DecomposeContext, DecomposeMapInput } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import { DecomposeRevisionPreviewSchema, DecomposeRevisionAppliedSchema, type DecomposeRevisionReport } from "./revision-report.js";
import { prepareDecomposeRevision } from "./revision-plan.js";
import { decomposeApplyAuthority } from "./apply-authority.js";
import { decomposeRemovalReferences } from "./removal-records.js";
import { revalidateLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
import { batchLifecycleWrites } from "../store/lifecycle-write.js";
import { decomposeProvenance } from "./provenance.js";
import { observeRecords } from "../store/record-observations.js";
import { freshDecomposeRevisionRemedy, recheckDecomposeRevisionRefusal } from "./revision-recheck.js";
import { sortByCanonicalBytes } from "../kernel/canonical/canonical-json.js";

/** Revise one current cut under approval bound to its exact proposed writes. */
export async function runStoreDecomposeRevision(ctx: DecomposeContext, origin: string,
  input: DecomposeMapInput, options: { applyAuthority?: string } = {}): Promise<DecomposeResult<DecomposeRevisionReport>> {
  const prepared = await prepareDecomposeRevision(ctx, origin, input);
  if (prepared.status === "refused") return prepared;
  const plan = prepared.result;
  const details = { origin: plan.map.machine.origin,
    members: plan.map.authoring.destinations.flatMap(destination => destination.kind === "new-member" ? [destination.slug] : []).sort(),
    removals: sortByCanonicalBytes(decomposeRemovalReferences(plan.writes)) };
  const applyAuthority = decomposeApplyAuthority({ mode: "revise", origin: details.origin, records: plan.records, writes: plan.writes,
    observations: plan.absenceObservations });
  if (options.applyAuthority === undefined) return { status: "ok", result: DecomposeRevisionPreviewSchema.parse({ kind: "preview", mode: "revise", ...details,
    applyAuthority, writes: sortByCanonicalBytes(plan.writes) }) };
  if (options.applyAuthority !== applyAuthority) return { status: "refused", reason: "stale-apply-authority", class: "recoverable",
    locus: "applyAuthority", remedy: freshDecomposeRevisionRemedy(origin, input.cutMapPath) };
  const valid = await revalidateLifecycleRecords(ctx.executor.store, plan.records);
  if (valid.status === "refused") return recheckDecomposeRevisionRefusal(ctx, origin, input, valid.refusal);
  const applied = await batchLifecycleWrites(ctx.executor.store, plan.writes, decomposeProvenance("revise"),
    [...observeRecords(plan.records), ...plan.absenceObservations]);
  return applied.status === "refused" ? recheckDecomposeRevisionRefusal(ctx, origin, input, applied.refusal)
    : { status: "ok", result: DecomposeRevisionAppliedSchema.parse({ kind: "revised", ...details }) };
}
