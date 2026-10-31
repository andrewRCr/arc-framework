/** Resolve the command's slug or UID before invoking owner-bound teardown. */
import { z } from "zod";
import type { Store } from "../lib/store/contract.js";
import { readWorkItemByUid } from "../lib/store/work-item-uid.js";
import { StoreRefusalError } from "../lib/store/refusal.js";
import type { TeardownSubject } from "../lib/work-unit/store-retirement-evidence.js";
import { runTeardown, type TeardownContext, type TeardownParams, type TeardownResult } from "../lib/work-unit/verbs/teardown.js";

/** Preserve ordinary command refusals while translating an explicit UID into its exact owner. */
export async function runTeardownForOperand(ctx: TeardownContext,
  params: Omit<TeardownParams, "subject"> & { name: string }): Promise<TeardownResult> {
  try {
    const { name, ...options } = params;
    const subject = ctx.store?.capabilities.stateOffBranch ? await resolveOperand(ctx.store, name) : { kind: "slug" as const, slug: name };
    return await runTeardown(ctx, { ...options, subject });
  } catch (error) {
    return { status: "rejected", reason: error instanceof Error ? error.message : String(error),
      ...(error instanceof StoreRefusalError ? { refusal: error.refusal } : {}) };
  }
}

async function resolveOperand(store: Store, name: string): Promise<TeardownSubject> {
  const parsed = z.uuid().safeParse(name);
  if (!parsed.success) return { kind: "slug", slug: name };
  const uid = parsed.data.toLowerCase(), selected = await readWorkItemByUid(store, uid);
  if (selected.status === "incomplete") throw new Error(`${selected.condition} ${selected.remedy.text}`);
  if (selected.status === "refused") throw new StoreRefusalError(selected.refusal);
  if (selected.result === null) {
    const lineage = await store.lookup({ kind: "lineage", origin: uid });
    if (lineage.status === "refused") throw new StoreRefusalError(lineage.refusal);
    return { kind: "owner", owner: lineage.result.reference.owner };
  }
  const reference = selected.result.reference;
  if (reference.kind !== "work-item/meta") throw new StoreRefusalError({ code: "record-malformed", class: "recoverable",
    reference, rule: "lifecycle.work-unit", condition: `UID ${uid} identifies an Errand rather than a work unit.`,
    remedy: { text: "Use the Errand's own cleanup commands, or name a work-unit slug or UID." } });
  return { kind: "owner", owner: reference.owner };
}
