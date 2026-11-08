/** A cohort rename's destination policy, which its preparation applies. */
import { SlugSchema } from "../kernel/index.js";
import { sameReference, type RecordReference } from "./identity.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";
import type { StoreView } from "./write-check.js";
import { holderCondition } from "./creation-admission.js";

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
