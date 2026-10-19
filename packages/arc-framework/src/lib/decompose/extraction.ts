/** Prepared extraction batches keep the origin and avoid physical lifecycle effects. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { Mutation, BatchResult } from "../store/write.js";
import type { StoreRecord } from "../store/read.js";
import type { DecomposeTerminalRecords } from "./acquire-terminal.js";
import type { DecomposeThinningPlan } from "./thinning.js";
import { prepareDecomposeTerminal } from "./terminal-preparation.js";
import { planDecomposeSourceThinning } from "./thinning.js";
import { readLifecycleMetaFields, recordPut, batchLifecycleWrites } from "../store/lifecycle-write.js";
import { writeMetaCohort } from "../store/kinds/meta/writers.js";
import { revalidateLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeProvenance } from "./provenance.js";
import type { StoreRefusal } from "../store/refusal.js";
import { decomposeFinishArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

/** All observed versions and the exact surviving-origin mutations. */
export interface DecomposeExtractionPlan {
  input: DecomposeTerminalRecords;
  records: readonly StoreRecord[];
  writes: readonly Mutation[];
  thinning: DecomposeThinningPlan;
}

/** Acquire and validate a surviving-origin terminal batch without writing. */
export async function prepareDecomposeExtraction(ctx: DecomposeContext, origin: string,
  selected?: DecomposeTerminalRecords): Promise<DecomposeResult<DecomposeExtractionPlan>> {
  const prepared = await prepareDecomposeTerminal(ctx, origin, "extraction", selected);
  if (prepared.status === "refused") return prepared;
  const { input, records, recordPlan } = prepared.result;
  const thinning = planDecomposeSourceThinning(input.map, input.acquired.artifacts);
  if (thinning.status === "refused") return thinning;
  const writes: Mutation[] = [...thinning.result.writes, ...recordPlan.writes];
  const placement = input.map.authoring.placement;
  if (placement.kind !== "direct-member") {
    const fields = readLifecycleMetaFields(input.acquired.primary);
    if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
    const cohort = placement.kind === "at-cap" ? placement.parent : placement.cohort;
    if (fields.result.cohort !== cohort) writes.push(recordPut(input.acquired.primary, {
      content: writeMetaCohort(input.acquired.primary.content, cohort),
    }));
  }
  return { status: "ok", result: { input, records, writes, thinning: thinning.result } };
}

/** Revalidate acquired records and apply only the prepared mutations. */
export async function applyDecomposeExtraction(ctx: DecomposeContext, plan: DecomposeExtractionPlan): Promise<DecomposeResult<BatchResult>> {
  const valid = await revalidateLifecycleRecords(ctx.executor.store, plan.records);
  if (valid.status === "refused") return extractionRejection(plan, valid.refusal);
  const batch = await batchLifecycleWrites(ctx.executor.store, plan.writes, decomposeProvenance("terminal"));
  return batch.status === "refused" ? extractionRejection(plan, batch.refusal) : batch;
}

function extractionRejection(plan: DecomposeExtractionPlan, refusal: StoreRefusal): DecomposeResult<never> {
  if (refusal.code !== "version-conflict") return decomposeStoreRefusal(refusal);
  const origin = plan.input.acquired.primary.reference.owner.name;
  const argv = decomposeFinishArgv(origin);
  return { status: "refused", reason: "version-conflict", class: "recoverable", locus: origin,
    message: refusal.condition, storeRefusal: refusal,
    remedy: { text: `Prepare a fresh terminal preview with ${renderV3DecomposeArgv(argv)} and obtain approval again.`, argv: [...argv] } };
}
