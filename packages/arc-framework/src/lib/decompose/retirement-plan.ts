/** Read-only composition of retirement checks, writes, and version guards. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeTerminalRecords } from "./acquire-terminal.js";
import type { DecomposeLineagePlan } from "./lineage-plan.js";
import type { DecomposeTerminalRecordPlan } from "./terminal-records.js";
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import { prepareDecomposeTerminal } from "./terminal-preparation.js";
import { prepareDecomposeLineage } from "./lineage-plan.js";
import { decomposeReadCache } from "./read-cache.js";
import { checkDecomposeRetirementCheckout } from "./retirement-checkout.js";
import { sameReference } from "../store/identity.js";

/** Complete write preview; the executor supplies the primary removal at application. */
export interface DecomposeRetirementPlan {
  input: DecomposeTerminalRecords;
  checkout: string | null;
  lineage: DecomposeLineagePlan;
  recordPlan: DecomposeTerminalRecordPlan;
  records: readonly StoreRecord[];
  writes: readonly Mutation[];
}

/** Acquire once, validate authoring and source bindings, and prepare one terminal transition. */
export async function prepareDecomposeRetirement(ctx: DecomposeContext, origin: string,
  selected?: DecomposeTerminalRecords): Promise<DecomposeResult<DecomposeRetirementPlan>> {
  const store = decomposeReadCache(ctx.executor.store);
  const reading = { ...ctx, executor: { ...ctx.executor, store } };
  const prepared = await prepareDecomposeTerminal(reading, origin, "retirement", selected);
  if (prepared.status === "refused") return prepared;
  const { input, recordPlan } = prepared.result;
  const lineage = await prepareDecomposeLineage(reading, input);
  if (lineage.status === "refused") return lineage;
  const records = [...prepared.result.records, ...lineage.result.observations]
    .filter((record, index, all) => all.findIndex(other => sameReference(other.reference, record.reference)) === index);
  const primary = input.acquired.primary;
  const checkout = await checkDecomposeRetirementCheckout(ctx, primary);
  if (checkout.status === "refused") return checkout;
  const writes: Mutation[] = [{ action: "remove", reference: primary.reference, expected: primary.version },
    lineage.result.write, ...recordPlan.writes];
  return { status: "ok", result: { input, checkout: checkout.result, lineage: lineage.result, recordPlan, records, writes } };
}
