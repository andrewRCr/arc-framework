/** Read-only composition of retirement checks, writes, and version guards. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeTerminalRecords } from "./acquire-terminal.js";
import type { DecomposeLineagePlan } from "./lineage-plan.js";
import type { DecomposeRetirementRecordPlan } from "./retirement-records.js";
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import { acquireDecomposeTerminal } from "./acquire-terminal.js";
import { checkDecomposeTerminalOrigin } from "./check-terminal-origin.js";
import { checkDecomposeSeededFields } from "./check-seeded-fields.js";
import { checkDecomposeConservation } from "./conservation.js";
import { checkDecomposeSourceBinding } from "./source-binding.js";
import { prepareDecomposeRetirementRecords } from "./retirement-records.js";
import { prepareDecomposeLineage } from "./lineage-plan.js";
import { decomposeReadCache } from "./read-cache.js";
import { checkDecomposeRetirementCheckout } from "./retirement-checkout.js";
import { sameReference } from "../store/identity.js";

/** Complete write preview; the executor supplies the primary removal at application. */
export interface DecomposeRetirementPlan {
  input: DecomposeTerminalRecords;
  checkout: string | null;
  lineage: DecomposeLineagePlan;
  recordPlan: DecomposeRetirementRecordPlan;
  records: readonly StoreRecord[];
  writes: readonly Mutation[];
}

/** Acquire once, validate authoring and source bindings, and prepare one terminal transition. */
export async function prepareDecomposeRetirement(ctx: DecomposeContext, origin: string): Promise<DecomposeResult<DecomposeRetirementPlan>> {
  const store = decomposeReadCache(ctx.executor.store);
  const reading = { ...ctx, executor: { ...ctx.executor, store } };
  const acquired = await acquireDecomposeTerminal(reading, origin);
  if (acquired.status === "refused") return acquired;
  const input = acquired.result;
  if (input.map.authoring.shape === "extraction") return { status: "refused", reason: "wrong-shape-mode", class: "recoverable",
    remedy: { text: "Finish the stored extraction through its surviving-origin batch." } };
  const kind = checkDecomposeTerminalOrigin(input);
  if (kind.status === "refused") return kind;
  const fields = await checkDecomposeSeededFields(reading, input);
  if (fields.status === "refused") return fields;
  const conservation = await checkDecomposeConservation(reading, input);
  if (conservation.status === "refused") return conservation;
  const binding = checkDecomposeSourceBinding(reading, input);
  if (binding.status === "refused") return binding;
  const recordPlan = await prepareDecomposeRetirementRecords(reading, input);
  if (recordPlan.status === "refused") return recordPlan;
  const lineage = await prepareDecomposeLineage(reading, input);
  if (lineage.status === "refused") return lineage;
  const records = [...recordPlan.result.records, ...fields.result.observations, ...conservation.result.records, ...lineage.result.observations]
    .filter((record, index, all) => all.findIndex(other => sameReference(other.reference, record.reference)) === index);
  const primary = input.acquired.primary;
  const checkout = await checkDecomposeRetirementCheckout(ctx, primary.reference.owner.name);
  if (checkout.status === "refused") return checkout;
  const writes: Mutation[] = [{ action: "remove", reference: primary.reference, expected: primary.version },
    lineage.result.write, ...recordPlan.result.writes];
  return { status: "ok", result: { input, checkout: checkout.result, lineage: lineage.result, recordPlan: recordPlan.result, records, writes } };
}
