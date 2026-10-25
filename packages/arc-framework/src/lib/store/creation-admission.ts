/** Shared admission of work-item names through ranked operational lookup. */
import { describeRecordConflicts } from "./conflict-diagnostics.js";
import { SlugSchema } from "../kernel/index.js";
import type { Store } from "./contract.js";
import { sameOwner, type OwnerIdentity, type RecordReference } from "./identity.js";
import type { StoreRefusal, Remedy } from "./refusal.js";

/** A resolved or tied holder and the name through which it holds the requested slug. */
export interface CreationAdmissionHolder { reference: RecordReference; name: "current" | "former" }
/** Why a completed or unreadable namespace cannot admit creation. */
export type CreationAdmissionCause = "completed-holder" | "completed-former-name" | "completed-tie" | "lookup" | "read" | "conflicts";
interface AdmissionEvidence { holders: readonly CreationAdmissionHolder[]; ambiguous: boolean; refusal?: StoreRefusal }
/** Admission preserves lookup evidence without selecting a repair for another lifecycle operation. */
export type CreationAdmission = { kind: "free" }
  | ({ kind: "held" } & AdmissionEvidence)
  | ({ kind: "refused"; cause: CreationAdmissionCause } & AdmissionEvidence);

/** Ask the shared namespace whether the requested slug can be acquired by a writing owner. */
export async function checkCreationAdmission(ports: Pick<Store, "lookup" | "read">, slug: string,
  writingOwners: readonly OwnerIdentity[] = []): Promise<CreationAdmission> {
  const lookup = await ports.lookup({ kind: "slug", slug: SlugSchema.parse(slug) });
  if (lookup.status === "refused") return lookupAdmission(lookup.refusal, slug);
  const read = await ports.read({ reference: lookup.result.reference });
  if (read.status === "refused") return { kind: "refused", cause: "read", holders: [namedHolder(lookup.result.reference, slug)], ambiguous: false, refusal: read.refusal };
  const record = read.result;
  const holders = [namedHolder(record.reference, slug)];
  if (record.conflicts.length > 0) return { kind: "refused", cause: "conflicts", holders, ambiguous: false,
    refusal: { code: "record-malformed", class: "recoverable", reference: record.reference, rule: "creation.holder-conflicts",
      condition: `The name holder has unresolved conflicts.${describeRecordConflicts(record.conflicts)}`,
      remedy: { text: "Resolve the holder's named conflict records, then retry creation." } } };
  if (writingOwners.some(owner => sameOwner(owner, record.reference.owner))) return { kind: "free" };
  if (record.placement?.kind !== "completed") return { kind: "held", holders, ambiguous: false };
  if (record.reference.owner.name !== slug) return { kind: "refused", cause: "completed-former-name", holders, ambiguous: false };
  return record.reference.kind === "work-item/meta" ? { kind: "free" }
    : { kind: "refused", cause: "completed-holder", holders, ambiguous: false };
}

function lookupAdmission(refusal: StoreRefusal, slug: string): CreationAdmission {
  if (refusal.code === "not-found") return { kind: "free" };
  if (refusal.code !== "ambiguous-match") return { kind: "refused", cause: "lookup", holders: [], ambiguous: false, refusal };
  const holders = refusal.candidates.map(reference => namedHolder(reference, slug));
  return refusal.tie?.liveness === "live" ? { kind: "held", holders, ambiguous: true, refusal }
    : { kind: "refused", cause: refusal.tie?.liveness === "completed" ? "completed-tie" : "lookup", holders, ambiguous: true, refusal };
}

function namedHolder(reference: RecordReference, slug: string): CreationAdmissionHolder {
  return { reference, name: reference.owner.name === slug ? "current" : "former" };
}

/** Render a creation refusal with holder identities and the repairs creation can offer. */
export function renderCreationAdmissionRefusal(slug: string, admission: Exclude<CreationAdmission, { kind: "free" }>): { condition: string; remedy: Remedy } {
  const condition = holderCondition(slug, admission);
  if (admission.kind === "refused" && admission.refusal !== undefined && admission.refusal.code !== "ambiguous-match") {
    return { condition: admission.holders.length === 0 ? admission.refusal.condition : `${condition} ${admission.refusal.condition}`,
      remedy: admission.refusal.remedy };
  }
  if (admission.kind === "refused" && admission.cause === "lookup") return {
    condition: `${condition} ${admission.refusal?.condition ?? "The lookup could not establish the ranking tier."}`,
    remedy: { text: "Restore the lookup's ranking evidence, then retry creation, or choose another name." },
  };
  const wait = admission.kind === "held" && admission.holders.some(holder => holder.name === "current");
  return { condition, remedy: { text: wait ? "Choose another name, or wait for the holders of the current name to complete." : "Choose another name." } };
}

function holderCondition(slug: string, admission: Exclude<CreationAdmission, { kind: "free" }>): string {
  const state = admission.kind === "held" ? "live " : admission.cause.startsWith("completed") ? "completed " : "";
  const holders = admission.holders.map(({ reference, name }) => {
    const type = reference.kind === "work-item/meta" ? "work unit" : reference.kind === "work-item/record" ? "Errand"
      : reference.kind === "cohort/document" ? "cohort" : reference.kind;
    const uid = reference.owner.type === "person" ? undefined : reference.owner.uid;
    return `${state}${type} '${reference.owner.name}' (UID ${uid ?? "unavailable"}; ${name} name)`;
  });
  return holders.length === 0 ? `The holders of name '${slug}' could not be established.` : `Name '${slug}' is held by ${holders.join("; ")}.`;
}
