/** Exact operational evidence and branch authority retained after a work unit ends. */
import { canonicalDigest } from "../kernel/canonical/canonical-json.js";
import { SlugSchema } from "../kernel/index.js";
import { LineageRecordSchema } from "../store/kinds/lineage/index.js";
import { readWorkUnit } from "../store/lifecycle-write.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { BranchLink } from "../store/links.js";
import type { RetirementEvidenceRef } from "./retirement-authority.js";
/** A selected terminal version binds every subsequent physical mutation. */
export interface StoreRetirementEvidence {
  record: StoreRecord; name: string; rule: "discard" | "landed"; branches: BranchLink[];
  evidence: RetirementEvidenceRef;
  revalidate: () => Promise<void>;
}
/** Read completed placement or terminal lineage, never guessing authority from a branch name. */
export async function readStoreRetirementEvidence(store: Store, name: string, baseOid: string): Promise<StoreRetirementEvidence> {
  const primary = await readWorkUnit(store, name);
  if (primary.status === "ok") {
    if (primary.result.placement?.kind !== "completed") throw new Error(`${name} has not ended; abandon or archive it before teardown.`);
    return bind(store, primary.result, "landed", primary.result.links?.branches ?? [], {
      kind: "shipped", expectedLifecycle: "completed", resultDigest: canonicalDigest(primary.result.content), baseProofOid: baseOid,
    });
  }
  if (primary.refusal.code !== "not-found") throw new Error(`${primary.refusal.condition} ${primary.refusal.remedy.text}`);
  const lookup = await store.lookup({ kind: "lineage", origin: SlugSchema.parse(name) });
  if (lookup.status === "refused") throw new Error(`${lookup.refusal.condition} ${lookup.refusal.remedy.text}`);
  const read = await store.read({ reference: lookup.result.reference });
  if (read.status === "refused") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  const lineage = LineageRecordSchema.parse(read.result.fields);
  if (read.result.reference.owner.type !== "work-item" || lineage.origin.name !== read.result.reference.owner.name
    || (lineage.origin.uid !== undefined && read.result.reference.owner.uid !== lineage.origin.uid)) throw new Error("Terminal lineage does not match its retiring owner; repair the lineage identity before teardown.");
  if (lineage.kind === "rename") throw new Error(`${name} was renamed; use its current work-unit name for teardown.`);
  if (lineage.retiredBranches === undefined) throw new Error(`Terminal lineage for ${name} lacks retiredBranches. Repair it with an explicit exact snapshot of trusted pre-transition branch links (including created/adopted authority and original order), using write-back/save or repair-lineage, then retry arc teardown ${name}; do not infer it from branch names.`);
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
