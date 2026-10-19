/** Shared terminal admission and recipient preparation for both cut shapes. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeTerminalRecords } from "./acquire-terminal.js";
import type { DecomposeTerminalRecordPlan } from "./terminal-records.js";
import type { StoreRecord } from "../store/read.js";
import { acquireDecomposeTerminal } from "./acquire-terminal.js";
import { checkDecomposeTerminalOrigin } from "./check-terminal-origin.js";
import { checkDecomposeSeededFields } from "./check-seeded-fields.js";
import { checkDecomposeConservation } from "./conservation.js";
import { checkDecomposeSourceBinding } from "./source-binding.js";
import { prepareDecomposeTerminalRecords } from "./terminal-records.js";
import { decomposeReadCache } from "./read-cache.js";
import { sameReference } from "../store/identity.js";

/** Checked cut inputs and every acquired version needed by either terminal writer. */
export interface DecomposeTerminalPreparation {
  input: DecomposeTerminalRecords;
  recordPlan: DecomposeTerminalRecordPlan;
  records: readonly StoreRecord[];
}

/** Repeat origin, seed, destination, source, and edge checks before preparing terminal writes. */
export async function prepareDecomposeTerminal(ctx: DecomposeContext, origin: string,
  mode: "retirement" | "extraction"): Promise<DecomposeResult<DecomposeTerminalPreparation>> {
  const reading = { ...ctx, executor: { ...ctx.executor, store: decomposeReadCache(ctx.executor.store) } };
  const acquired = await acquireDecomposeTerminal(reading, origin);
  if (acquired.status === "refused") return acquired;
  const input = acquired.result;
  if ((input.map.authoring.shape === "extraction") !== (mode === "extraction")) return {
    status: "refused", reason: "wrong-shape-mode", class: "recoverable",
    remedy: { text: "Finish the stored cut through the terminal batch for its authored shape." },
  };
  const kind = checkDecomposeTerminalOrigin(input);
  if (kind.status === "refused") return kind;
  const fields = await checkDecomposeSeededFields(reading, input);
  if (fields.status === "refused") return fields;
  const conservation = await checkDecomposeConservation(reading, input);
  if (conservation.status === "refused") return conservation;
  const binding = checkDecomposeSourceBinding(reading, input);
  if (binding.status === "refused") return binding;
  const recordPlan = await prepareDecomposeTerminalRecords(reading, input);
  if (recordPlan.status === "refused") return recordPlan;
  const records = [...recordPlan.result.records, ...fields.result.observations, ...conservation.result.records]
    .filter((record, index, all) => all.findIndex(other => sameReference(other.reference, record.reference)) === index);
  return { status: "ok", result: { input, recordPlan: recordPlan.result, records } };
}
