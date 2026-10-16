/** Current work-unit inbound pressure over operational records. */
import { inboundPendingFigures } from "../inbox/pending.js";
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { parseEntryList } from "../store/kinds/entry-list.js";
import { readWorkUnit } from "../store/lifecycle-write.js";
import { recordReferences } from "../store/identity.js";
import type { Store } from "../store/contract.js";
import { z } from "zod";
import { SessionActionsSchema } from "./actions.js";

/** Inbound figures and thresholds, or no list while the checkout-backed lifecycle is active. */
export const InboundBackPressureResultSchema = z.strictObject({
  pendingCount: z.number().int().nonnegative(),
  oldestAgeDays: z.number().nonnegative().nullable(),
  countThreshold: z.number().int().nonnegative(),
  ageThresholdDays: z.number().nonnegative(),
  actions: SessionActionsSchema.optional(),
}).nullable();
export type InboundBackPressureResult = z.infer<typeof InboundBackPressureResultSchema>;

/** Report no inbound list while the checkout-backed lifecycle is active. */
export interface RunInboundBackPressureOptions {
  store: Store; workUnit: string; countThreshold: number; ageThresholdDays: number; now?: Date;
}
export function runInboundBackPressure(): InboundBackPressureResult;
export function runInboundBackPressure(options: RunInboundBackPressureOptions): Promise<InboundBackPressureResult>;
/** Keep the pre-flip result dormant and read the bound inbound kind after the flip. */
export function runInboundBackPressure(options?: RunInboundBackPressureOptions): InboundBackPressureResult | Promise<InboundBackPressureResult> {
  return options === undefined ? null : readInboundBackPressure(options);
}

async function readInboundBackPressure(options: RunInboundBackPressureOptions): Promise<InboundBackPressureResult> {
  if (!options.store.capabilities.stateOffBranch) return null;
  const selected = await readWorkUnit(options.store, options.workUnit);
  if (selected.status === "refused") throw new Error(`${selected.refusal.condition} ${selected.refusal.remedy.text}`);
  const primary = selected.result;
  const fields = ParsedMetaRecordSchema.parse(primary.fields);
  const read = await options.store.read({ reference: recordReferences["work-item/inbound"](primary.reference.owner) });
  if (read.status === "refused" && read.refusal.code !== "not-found") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  if (read.status === "ok" && read.result.conflicts.length > 0) throw new Error("The work unit's inbound list has unresolved conflicts. Resolve them before re-triage.");
  const parsed = parseEntryList(read.status === "ok" ? read.result.content : "", "work-item/inbound");
  if (!parsed.success) throw new Error(parsed.error);
  const figures = inboundPendingFigures(parsed.data.entries, options.now ?? new Date());
  const tripped = figures.count > options.countThreshold || (figures.oldestAgeDays !== null && figures.oldestAgeDays > options.ageThresholdDays);
  const name = primary.reference.owner.name;
  return InboundBackPressureResultSchema.parse({ pendingCount: figures.count, oldestAgeDays: figures.oldestAgeDays,
    countThreshold: options.countThreshold, ageThresholdDays: options.ageThresholdDays,
    ...(tripped ? { actions: [{ text: `Owner '${fields.owner ?? "unknown"}' should re-triage inbound work with arc inbox ${name}.` }] } : {}) });
}
