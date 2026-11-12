/** Atomic creation of a stored cut and its member and cohort scaffolds. */
import type { DecomposeContext, DecomposeMapInput } from "./context.js";
import type { DecomposeAdditiveMode } from "./bind-map.js";
import type { DecomposeResult } from "./refusal.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeMemberScaffold } from "./member-scaffold.js";
import type { DecomposeCohortScaffolds } from "./cohort-scaffold.js";
import type { RecordReference } from "../store/identity.js";
import type { BatchResult } from "../store/write.js";
import { prepareDecomposeAdditive } from "./additive-plan.js";
import { revalidateLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
import { observeRecords } from "../store/record-observations.js";
import { sameReference } from "../store/identity.js";
import { batchLifecycleWrites } from "../store/lifecycle-write.js";
import { decomposeProvenance } from "./provenance.js";
import { reportDecomposeAdditive, type DecomposeAdditiveReport } from "./additive-report.js";
import { recheckDecomposeAdditiveRefusal } from "./additive-recheck.js";

/** Landed additive writes retained for structured authoring reports. */
export interface DecomposeAdditiveApplied {
  map: CutMap;
  storedMap: RecordReference;
  members: readonly DecomposeMemberScaffold[];
  cohorts: DecomposeCohortScaffolds["cohorts"];
  batch: BatchResult;
  report: DecomposeAdditiveReport;
}

/** Bind, validate, and atomically create one cut without changing its original content. */
export async function runStoreDecomposeAdditive(ctx: DecomposeContext, origin: string, mode: DecomposeAdditiveMode,
  input: DecomposeMapInput): Promise<DecomposeResult<DecomposeAdditiveApplied>> {
  const plan = await prepareDecomposeAdditive(ctx, origin, mode, input);
  if (plan.status === "refused") return plan;
  const valid = await revalidateLifecycleRecords(ctx.executor.store, plan.result.observations);
  if (valid.status === "refused") return recheckDecomposeAdditiveRefusal(ctx, origin, mode, input, valid.refusal);
  const records = [...plan.result.prepared.records, ...plan.result.observations]
    .filter((record, index, all) => !all.slice(0, index).some(prior => sameReference(prior.reference, record.reference)));
  const batch = await batchLifecycleWrites(ctx.executor.store, plan.result.prepared.writes,
    decomposeProvenance("additive"), [...observeRecords(records), ...plan.result.absenceObservations]);
  if (batch.status === "refused") return recheckDecomposeAdditiveRefusal(ctx, origin, mode, input, batch.refusal);
  const { map, storedMap, members, cohorts } = plan.result;
  const applied = { map, storedMap, members, cohorts, batch: batch.result };
  return { status: "ok", result: { ...applied, report: reportDecomposeAdditive(applied) } };
}
