/** Family-scoped interpretation of a name before rewriting shared rename references. */
import type { Store } from "./contract.js";
import { OwnerIdentitySchema, RecordReferenceSchema, sameOwner, type RecordReference } from "./identity.js";
import type { StoreResult } from "./refusal.js";

/** Whether ranked references to one name can designate this rename's subject. */
export type RenameReferenceResolution = "subject" | "ambiguous" | "other";

/** Resolve a name once within its declared owner family, retaining unavailable evidence as a refusal. */
export async function resolveRenameReferences(store: Pick<Store, "read">, subject: RecordReference,
  name: string): Promise<StoreResult<RenameReferenceResolution>> {
  const family = subject.owner.type === "cohort" ? "cohort" : "work-item";
  const reference = RecordReferenceSchema.parse({ owner: OwnerIdentitySchema.parse({ type: family, name }),
    kind: family === "cohort" ? "cohort/document" : "work-item/meta" });
  const read = await store.read({ reference });
  if (read.status === "ok") return { status: "ok", result: sameOwner(read.result.reference.owner, subject.owner) ? "subject" : "other" };
  if (read.refusal.code !== "ambiguous-match") return read;
  return { status: "ok", result: read.refusal.candidates.some(candidate => sameOwner(candidate.owner, subject.owner)) ? "ambiguous" : "other" };
}
