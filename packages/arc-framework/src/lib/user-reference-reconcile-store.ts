/** One reusable record acquisition for the read-only user slot and its prepared apply command. */
import { describeRecordConflicts } from "./store/conflict-diagnostics.js";
import { SlugSchema } from "./kernel/index.js";
import { resolveArcPath } from "./layout/index.js";
import type { Store } from "./store/contract.js";
import { OwnerIdentitySchema, recordReferences, sameReference, type RecordReference } from "./store/identity.js";
import type { StoreRecord } from "./store/read.js";
import type { StoreResult } from "./store/refusal.js";
import { acquireStoreUserReferenceAuthority, type StoreUserReferenceAuthority } from "./store/user-reference-authority.js";
import { readLifecycleMetaFields, workUnitMetaPath } from "./store/lifecycle-write.js";
import { parseEntryList } from "./store/kinds/entry-list.js";
import { revalidateLifecycleRecords } from "./work-unit/prepared-lifecycle-write.js";
import { resolveStoreReferenceTargets } from "./store/user-reference-targets.js";
import { planUserReferenceReconcile } from "./user-reference-reconcile.js";
import type { PlanUserReferenceReconcileInput, UserReferenceEvidenceAuthorityResult, UserReferenceStoreBasis, UserReferenceSurface } from "./user-reference-reconcile.js";

/** Captured surfaces and their complete expected-version basis, shared by inspection and apply. */
export interface StoreUserReferencePreparation {
  authority: Extract<UserReferenceEvidenceAuthorityResult, { status: "ready" }>;
  surfaces: Omit<PlanUserReferenceReconcileInput, "transitions">;
  preparedStore: UserReferenceStoreBasis;
}
/** Acquire personal records and the current meta's session context without workspace or Git reads. */
export async function createStoreUserReferencePrepareContext(input: {
  store: Store; identity: string; workUnit?: string;
}): Promise<StoreResult<StoreUserReferencePreparation>> {
  const identity = SlugSchema.parse(input.identity);
  const acquired = await acquireStoreUserReferenceAuthority(input.store);
  if (acquired.status === "refused") return acquired;
  const records = [...acquired.result.records];
  const byPath = new Map<string, StoreRecord>();
  const owner = OwnerIdentitySchema.parse({ type: "person", name: identity });
  const inbox = await readPersonal(input.store, recordReferences["personal/inbox"](owner));
  if (inbox.status === "refused") return inbox;
  const memory = await readPersonal(input.store, recordReferences["personal/working-memory"](owner));
  if (memory.status === "refused") return memory;
  const inboxPath = resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity } });
  const memoryPath = resolveArcPath({ kind: "user-document", identity, document: { kind: "working-memory" } });
  for (const [path, record] of [[inboxPath, inbox.result], [memoryPath, memory.result]] as const) {
    if (record !== null) { records.push(record); byPath.set(path, record); }
  }
  const surfaces: StoreUserReferencePreparation["surfaces"] = {
    stateOffBranch: input.store.capabilities.stateOffBranch,
    userInbox: { path: inboxPath, content: inbox.result?.content ?? "" },
    ...(memory.result === null ? {} : { workingMemory: { path: memoryPath, content: memory.result.content } }),
  };
  if (input.workUnit !== undefined) {
    const context = await acquireSessionContext(input.store, records, input.workUnit);
    if (context.status === "refused") return context;
    byPath.set(context.result.surface.path, context.result.record);
    surfaces.sessionNotes = context.result.surface;
  }
  const qualified = await qualifyReferenceSurfaces(input.store, records, surfaces, acquired.result.transitions);
  if (qualified.status === "refused") return qualified;
  const valid = await revalidateLifecycleRecords(input.store, records);
  if (valid.status === "refused") return valid;
  return { status: "ok", result: { authority: { status: "ready", ref: "store", remoteEvidence: "not-applicable", transitions: acquired.result.transitions },
    surfaces: qualified.result, preparedStore: { store: input.store, records, byPath } } };
}
async function acquireSessionContext(store: Store, records: readonly StoreRecord[], workUnit: string): Promise<StoreResult<{ record: StoreRecord; surface: UserReferenceSurface }>> {
  const selected = await store.lookup({ kind: "slug", slug: SlugSchema.parse(workUnit) });
  if (selected.status === "refused") return selected;
  const meta = records.find(record => sameReference(record.reference, selected.result.reference));
  if (meta?.reference.kind !== "work-item/meta") return invalid(selected.result.reference,
    "The selected work unit is not in the acquired metadata authority. Read its current record again, then retry.");
  const fields = readLifecycleMetaFields(meta);
  if (fields.status === "refused") return fields;
  return { status: "ok", result: { record: meta, surface: { path: workUnitMetaPath(meta), content: fields.result.sessionContext ?? "" } } };
}
async function qualifyReferenceSurfaces(store: Store, records: readonly StoreRecord[],
  surfaces: StoreUserReferencePreparation["surfaces"], transitions: StoreUserReferenceAuthority["transitions"]): Promise<StoreResult<StoreUserReferencePreparation["surfaces"]>> {
  const plan = planUserReferenceReconcile({ ...surfaces, transitions });
  const subjects = [...plan.edits.flatMap(edit => edit.replacements.map(replacement => replacement.subject)),
    ...plan.advisories.map(advisory => advisory.subject)];
  const resolutions = await resolveStoreReferenceTargets(store, records, transitions, subjects);
  if (resolutions.status === "refused") return resolutions;
  return { status: "ok", result: resolutions.result.length === 0 ? surfaces : { ...surfaces, referenceResolutions: resolutions.result } };
}
async function readPersonal(store: Store, reference: RecordReference): Promise<StoreResult<StoreRecord | null>> {
  const read = await store.read({ reference });
  if (read.status === "refused") return read.refusal.code === "not-found" ? { status: "ok", result: null } : read;
  if (read.result.conflicts.length > 0) return invalid(reference, `Personal record ${reference.kind} for '${reference.owner.name}' has unresolved conflicts.${describeRecordConflicts(read.result.conflicts)}`);
  const kind = reference.kind === "personal/inbox" ? "personal/inbox" : "personal/working-memory";
  const parsed = parseEntryList(read.result.content, kind);
  return parsed.success ? read : invalid(reference, parsed.error);
}
function invalid(reference: RecordReference, condition: string): StoreResult<never> {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference, rule: "user-reference.prepare", condition,
    remedy: { text: "Repair the selected record and resolve its conflicts, then prepare user-reference reconciliation again." } } };
}
