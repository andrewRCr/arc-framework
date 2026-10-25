/** Exact operational evidence and branch authority retained after a work unit ends. */
import { z } from "zod";
import { canonicalDigest } from "../kernel/canonical/canonical-json.js";
import { SlugSchema } from "../kernel/index.js";
import { LineageRecordSchema } from "../store/kinds/lineage/index.js";
import { StoreRefusalError } from "../store/refusal.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { BranchLink } from "../store/links.js";
import type { RetirementEvidenceRef } from "./retirement-authority.js";
import { recordReferences, sameOwner, type OwnerIdentity, type RecordReference } from "../store/identity.js";
/** User operands resolve once; callers holding an owner retain that exact identity. */
export type TeardownSubject = { kind: "slug"; slug: string } | { kind: "owner"; owner: OwnerIdentity };
/** Read a typed teardown request's unambiguous command operand. */
export function teardownSubjectOperand(subject: TeardownSubject): string {
  if (subject.kind === "slug") return subject.slug;
  if (subject.owner.type !== "work-item" || subject.owner.uid === undefined)
    throw new Error("Owner-selected teardown requires an owner UID; resolve the exact owner, then retry.");
  return subject.owner.uid;
}
/** Use a display slug only when command selection still identifies this exact holder. */
export async function teardownOperand(store: Store, owner: OwnerIdentity): Promise<string> {
  const uid = teardownSubjectOperand({ kind: "owner", owner });
  if (z.uuid().safeParse(owner.name).success) return uid;
  const selected = await store.lookup({ kind: "slug", slug: owner.name });
  return selected.status === "ok" && selected.result.reference.kind === "work-item/meta"
    && sameOwner(selected.result.reference.owner, owner) ? owner.name : uid;
}
/** Resolve a user-selected work unit or retired origin without reselecting a supplied owner. */
export async function resolveTeardownSubject(store: Store, subject: TeardownSubject): Promise<RecordReference> {
  if (subject.kind === "owner") return recordReferences["work-item/meta"](subject.owner);
  const slug = SlugSchema.parse(subject.slug), selected = await store.lookup({ kind: "slug", slug });
  if (selected.status === "refused") {
    if (selected.refusal.code !== "not-found") throw new StoreRefusalError(selected.refusal);
    const lineage = await store.lookup({ kind: "lineage", origin: slug });
    if (lineage.status === "refused") throw new StoreRefusalError(lineage.refusal);
    return recordReferences["work-item/meta"](lineage.result.reference.owner);
  }
  const reference = selected.result.reference;
  if (reference.kind !== "work-item/meta") throw new StoreRefusalError({
    code: "record-malformed", class: "recoverable", reference, rule: "lifecycle.work-unit",
    condition: `\`${slug}\` resolves to ${reference.kind === "cohort/document" ? "a cohort" : "an Errand"} rather than a work unit.`,
    remedy: { text: reference.kind === "cohort/document" ? `Use the cohort's own commands for \`${slug}\`, or name a work unit.`
      : `Use the Errand verb for \`${slug}\`, or name a work unit.` },
  });
  return reference;
}
/** A selected terminal version binds every subsequent physical mutation. */
export interface StoreRetirementEvidence {
  record: StoreRecord; name: string; rule: "discard" | "landed"; branches: BranchLink[];
  evidence: RetirementEvidenceRef;
  revalidate: () => Promise<void>;
}
/** Read completed placement or terminal lineage, never guessing authority from a branch name. */
export async function readStoreRetirementEvidence(store: Store, subject: RecordReference, baseOid: string): Promise<StoreRetirementEvidence> {
  const owner = subject.owner;
  if (subject.kind !== "work-item/meta" || owner.type !== "work-item" || owner.uid === undefined)
    throw new Error("Retirement evidence requires a work-unit primary reference with an owner UID; resolve the exact owner, then retry teardown.");
  const name = owner.name;
  const primary = await store.read({ reference: subject });
  if (primary.status === "ok") {
    if (primary.result.placement?.kind !== "completed") throw new Error(`${name} has not ended; abandon or archive it before teardown.`);
    return bind(store, primary.result, "landed", primary.result.links?.branches ?? [], {
      kind: "shipped", expectedLifecycle: "completed", resultDigest: canonicalDigest(primary.result.content), baseProofOid: baseOid,
    });
  }
  if (primary.refusal.code !== "not-found") throw new StoreRefusalError(primary.refusal);
  return readRetiredOrigin(store, name, owner.uid);
}
async function readRetiredOrigin(store: Store, name: string, uid: string): Promise<StoreRetirementEvidence> {
  const lookup = await store.lookup({ kind: "lineage", origin: uid });
  if (lookup.status === "refused") throw new StoreRefusalError(lookup.refusal);
  const read = await store.read({ reference: lookup.result.reference });
  if (read.status === "refused") throw new StoreRefusalError(read.refusal);
  const lineage = LineageRecordSchema.parse(read.result.fields);
  if (read.result.reference.owner.type !== "work-item" || lineage.origin.name !== read.result.reference.owner.name
    || (lineage.origin.uid !== undefined && read.result.reference.owner.uid !== lineage.origin.uid)) throw new Error("Terminal lineage does not match its retiring owner; repair the lineage identity before teardown.");
  if (lineage.kind === "rename") throw new Error(`${name} was renamed; use its current work-unit name for teardown.`);
  if (lineage.retiredBranches === undefined) throw new Error(`Terminal lineage for ${name} lacks retiredBranches. Repair it with an explicit exact snapshot of trusted pre-transition branch links (including created/adopted authority and original order), using write-back/save or repair-lineage, then retry arc teardown ${uid}; do not infer it from branch names.`);
  return bind(store, read.result, lineage.kind === "abandon" ? "discard" : "landed", lineage.retiredBranches, {
    kind: "lineage", transition: lineage.kind, reference: read.result.reference, version: read.result.version, resultDigest: canonicalDigest(read.result.content),
  });
}
function bind(store: Store, record: StoreRecord, rule: "discard" | "landed", branches: BranchLink[], evidence: RetirementEvidenceRef): StoreRetirementEvidence {
  return { record, name: record.reference.owner.name, rule, branches, evidence, revalidate: async () => {
    const fresh = await store.read({ reference: record.reference });
    if (fresh.status === "refused") throw new Error(`${fresh.refusal.condition} ${fresh.refusal.remedy.text}`);
    if (fresh.result.version !== record.version) throw new Error("Retirement evidence changed; re-read its exact version and retry teardown.");
  } };
}
