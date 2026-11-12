/** Exact Store proof for ordinary Errand terminal and merge admission. */
import { describeRecordConflicts } from "../store/conflict-diagnostics.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord, ListingDiagnostic } from "../store/read.js";
import { sameReference } from "../store/identity.js";
import { SlugSchema } from "../kernel/index.js";
import type { StoreIdentityDiscovery } from "../locus/store-identities.js";
import { deserializeTransientIdentityRecord } from "./identity-record.js";
import type { OrdinaryErrandRecord } from "./identity-transitions.js";

/** The exact record can be absent only under the legacy no-diagnostic admission rule. */
export type StoreTerminalBasis = { kind: "ready"; record: OrdinaryErrandRecord | null }
  | { kind: "refused"; message: string };

/** Validate acquisitions independently, then prove only the subject's current claim. */
export async function readStoreTerminalBasis(input: { store: Store; discovery: StoreIdentityDiscovery;
  subject: { slug: string; claimId: string } }): Promise<StoreTerminalBasis> {
  const inventory = storeTerminalAcquisitionRefusal(input.discovery);
  if (inventory !== null) return refused(inventory);
  const diagnostics = input.discovery.errands.kind === "complete" ? input.discovery.errands.diagnostics : [];
  const found = await input.store.lookup({ kind: "claim", claim: { kind: "errand", slug: SlugSchema.parse(input.subject.slug), claimId: input.subject.claimId } });
  if (found.status === "refused") return found.refusal.code === "not-found" ? missingStoreTerminalSubject(input.subject.slug, diagnostics)
    : refused(`Errand ${input.subject.slug}: ${found.refusal.condition} ${found.refusal.remedy.text}`);
  const read = await input.store.read({ reference: found.result.reference });
  if (read.status === "refused") return read.refusal.code === "not-found" ? missingStoreTerminalSubject(input.subject.slug, diagnostics)
    : refused(`Errand ${input.subject.slug}: ${read.refusal.condition} ${read.refusal.remedy.text}`);
  return validateSubject(read.result, found.result.reference, input.subject);
}

/** Failed or diagnostic-bearing claims cannot stand in for an empty inventory. */
export function storeTerminalAcquisitionRefusal(discovery: StoreIdentityDiscovery): string | null {
  const { errands, claims } = discovery;
  if (errands.kind !== "complete") return `The Errands acquisition is ${errands.kind}. ${errands.kind === "error" ? errands.message : "Repair the Errand inventory, then retry."}`;
  if (claims.kind === "error") return `The claims acquisition failed. ${claims.message}`;
  if (claims.kind === "complete" && (claims.missed || claims.diagnostics.length > 0)) {
    return `The claims acquisition is incomplete. ${renderDiagnostics(claims.diagnostics) || "Repair the claims inventory, then retry."}`;
  }
  return null;
}
function validateSubject(saved: StoreRecord, reference: StoreRecord["reference"], subject: { slug: string; claimId: string }): StoreTerminalBasis {
  if (!sameReference(saved.reference, reference) || saved.reference.kind !== "work-item/record"
    || saved.reference.owner.name !== subject.slug || saved.placement?.kind !== "active") {
    return refused(`Errand ${subject.slug}: its claim does not resolve to the exact active Errand record. Repair that record's identity and placement, then retry.`);
  }
  if (saved.conflicts.length > 0) return refused(`Errand ${subject.slug} has unresolved conflicts.${describeRecordConflicts(saved.conflicts)}`);
  const decoded = deserializeTransientIdentityRecord(saved.content, subject.slug);
  if (decoded.kind !== "valid" || decoded.record.kind !== "errand" || decoded.record.purpose !== "errand"
    || decoded.record.claimId !== subject.claimId || decoded.record.owner === undefined) {
    return refused(`Errand ${subject.slug}: the subject record is malformed or its claim or owner is unavailable. Repair the record${decoded.kind === "malformed" ? ` (${decoded.message})` : ""}, then retry.`);
  }
  return { kind: "ready", record: decoded.record };
}
/** Retain actual diagnostics when the exact subject cannot be resolved. */
export function missingStoreTerminalSubject(slug: string, diagnostics: readonly ListingDiagnostic[]): StoreTerminalBasis {
  return diagnostics.length === 0 ? { kind: "ready", record: null }
    : refused(`Errand ${slug} could not be resolved beside Errand listing diagnostics. ${renderDiagnostics(diagnostics)}`);
}
function renderDiagnostics(diagnostics: readonly ListingDiagnostic[]): string {
  return diagnostics.map(diagnostic => `${diagnostic.key}: ${diagnostic.condition} ${diagnostic.remedy.text}`).join(" ");
}
function refused(message: string): Extract<StoreTerminalBasis, { kind: "refused" }> { return { kind: "refused", message }; }
