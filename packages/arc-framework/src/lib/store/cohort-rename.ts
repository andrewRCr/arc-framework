/** Atomic logical cohort renames with exact selected identity and read-only continuations. */
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult, StoreRefusal } from "./refusal.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences, sameReference } from "./identity.js";
import { batchLifecycleWrites, recordPut } from "./lifecycle-write.js";
import { observeRecords } from "./record-observations.js";
import { checkCohortRenameTarget } from "./lifecycle-rename.js";
import { rewriteCohortHeading, writeCohortParent, parseCohortDocument } from "./kinds/cohort/index.js";
import { observeRenameFormerName } from "./rename-reference-resolution.js";
import { emptyRenameReport } from "../work-unit/rename-report.js";
import type { RunRenameResult } from "../work-unit/verbs/rename.js";

/** Rename the UID-selected cohort without any code-branch or checkout operation. */
export async function runCohortRename(store: Store, primary: StoreRecord,
  request: { operand: string; targetSlug: string }): Promise<RunRenameResult> {
  if (primary.placement?.kind === "completed") return rejected({ code: "unsupported", class: "terminal", case: "rename",
    condition: `Cohort ${primary.reference.owner.name} is already completed; a closed cohort cannot be renamed.`,
    remedy: { text: "Keep this closed cohort's name." } });
  const collision = await checkCohortRenameTarget(store, primary, request.targetSlug);
  if (collision?.status === "refused") return rejected(collision.refusal);
  const resuming = primary.reference.owner.name === request.targetSlug;
  const source = resuming ? await priorCohortName(store, primary) : { status: "ok" as const, result: primary.reference.owner.name };
  if (source.status === "refused") return rejected(source.refusal);
  if (source.result === request.targetSlug) return { status: "rejected", reason: "Rename needs distinct source and target names." };
  const reference = RecordReferenceSchema.parse({ ...primary.reference, owner: { ...primary.reference.owner, name: request.targetSlug } });
  if (!resuming) {
    const prepared = await prepareDocument(store, primary, request.targetSlug);
    if (prepared.status === "refused") return rejected(prepared.refusal);
    const write = recordPut(primary, { content: prepared.result.content });
    write.reference = reference;
    const landed = await batchLifecycleWrites(store, [write], { verb: "rename", lifecycleAction: "rename" }, observeRecords(prepared.result.records));
    if (landed.status === "refused") return rejected(landed.refusal);
  }
  const former = await observeRenameFormerName(store, source.result);
  return { status: "renamed", shape: "cohort", reference, sourceSlug: source.result, targetSlug: request.targetSlug,
    recordBatch: resuming ? "existing" : "applied", pendingIntegration: false,
    advisories: [...(resuming ? ["Cohort already renamed; no records changed."] : []), ...former.advisories],
    report: { ...emptyRenameReport(), formerSlugTies: former.ties } };
}

async function prepareDocument(store: Store, primary: StoreRecord, target: string): Promise<StoreResult<{ content: string; records: StoreRecord[] }>> {
  const parsed = parseCohortDocument(primary.content), records = [primary];
  if (!parsed.success) return malformed(primary, parsed.error);
  let content = rewriteCohortHeading(primary.content, target);
  if (parsed.data.parent !== null) {
    const parent = await store.read({ reference: recordReferences["cohort/document"](
      OwnerIdentitySchema.parse({ type: "cohort", name: parsed.data.parent })) });
    if (parent.status === "refused") return parent;
    const retained = retainRecord(records, parent.result);
    if (retained.status === "refused") return retained;
    content = writeCohortParent(content, retained.result.reference.owner.name) ?? content;
  }
  return { status: "ok", result: { content, records } };
}

function retainRecord(records: StoreRecord[], record: StoreRecord): StoreResult<StoreRecord> {
  const prior = records.find(item => sameReference(item.reference, record.reference));
  if (prior === undefined) { records.push(record); return { status: "ok", result: record }; }
  if (prior.version === record.version && prior.conflicts.length === record.conflicts.length
    && prior.conflicts.every(reference => record.conflicts.some(other => sameReference(reference, other)))) return { status: "ok", result: prior };
  return { status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: [record.reference],
    condition: "Cohort rename observed inconsistent versions or conflicts for one record.",
    remedy: { text: "Read the current cohort evidence and retry rename." } } };
}

function malformed(primary: StoreRecord, condition: string): StoreResult<never> {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: primary.reference,
    rule: "lifecycle.rename", condition, remedy: { text: "Repair the cohort document and retry rename." } } };
}

async function priorCohortName(store: Store, primary: StoreRecord): Promise<StoreResult<string>> {
  const history = await store.history({ reference: primary.reference });
  if (history.status === "refused") return history;
  return { status: "ok", result: history.result.find(entry => entry.reference.kind === "cohort/document"
    && entry.reference.owner.name !== primary.reference.owner.name)?.reference.owner.name ?? primary.reference.owner.name };
}

function rejected(refusal: StoreRefusal): Extract<RunRenameResult, { status: "rejected" }> {
  return { status: "rejected", reason: refusal.condition, refusal };
}
