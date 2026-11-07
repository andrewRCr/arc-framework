/** Preserve each rename's destination policy in the atomic admission view. */
import { SlugSchema } from "../kernel/index.js";
import { sameReference, type RecordReference } from "./identity.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult, Remedy } from "./refusal.js";
import type { BrokenRule, StoreView, WriteCheckInput } from "./write-check.js";
import { observeRecord } from "./kinds/rule-support.js";
import { checkCreationAdmission, renderCreationAdmissionRefusal, holderCondition } from "./creation-admission.js";

/** Refuse any other current or former holder of a cohort's proposed name. */
export async function checkCohortRenameTarget(store: Pick<StoreView, "lookup">, primary: StoreRecord,
  target: string): Promise<StoreResult<never> | undefined> {
  const collision = await store.lookup({ kind: "slug", slug: SlugSchema.parse(target) });
  let references: RecordReference[];
  if (collision.status === "ok") {
    if (sameReference(collision.result.reference, primary.reference)) return undefined;
    references = [collision.result.reference];
  } else {
    if (collision.refusal.code !== "ambiguous-match") return collision.refusal.code === "not-found" ? undefined : collision;
    references = collision.refusal.candidates;
  }
  const condition = holderCondition(target, { kind: "refused", cause: "lookup", ambiguous: references.length > 1,
    holders: references.map(reference => ({ reference, name: reference.owner.name === target ? "current" : "former" })) });
  const remedy = { text: "Choose another slug." };
  return collision.status === "refused" ? { ...collision, refusal: { ...collision.refusal, condition, remedy } }
    : { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: primary.reference,
      rule: "lifecycle.rename", condition, remedy } };
}

/** Recheck destination eligibility only when a rename changes a primary's current name. */
export async function checkRenameTarget(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.writer.kind !== "verb" || input.writer.verb !== "rename" || input.prior === undefined || input.next === undefined) return [];
  const fail = (condition: string, remedy: Remedy = {
    text: "Restore readable destination evidence, prepare the rename again, and retry; no rename mutations were published.",
  }): readonly BrokenRule[] => [{ rule: "rename.target", condition, remedy }];
  const prior = await observeRecord(input.before, input.reference), next = await observeRecord(input.after, input.reference);
  if (prior.status !== "known" || next.status !== "known") return fail("Rename identity evidence is unavailable.");
  const primary = prior.value, target = next.value.reference.owner.name;
  if (primary.reference.owner.name === target) return [];
  if (primary.reference.kind === "cohort/document") {
    const collision = await checkCohortRenameTarget(input.before, primary, target);
    return collision?.status === "refused" ? fail(collision.refusal.condition, collision.refusal.remedy) : [];
  }
  const admission = await checkCreationAdmission(input.before, target, [primary.reference.owner]);
  if (admission.kind === "free") return [];
  const rendered = renderCreationAdmissionRefusal(target, admission);
  return fail(rendered.condition, { ...rendered.remedy, text: rendered.remedy.text.replaceAll("retry creation", "retry rename") });
}
