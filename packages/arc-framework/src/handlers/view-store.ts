/** Bind view targets and artifact reads to one store, exact record identities, and projected coordinates. */
import { resolve } from "node:path";
import { resolveCurrentWorkUnit } from "../lib/store/current-work-unit.js";
import type { Store } from "../lib/store/contract.js";
import { readWorkUnit, readLifecycleMetaFields } from "../lib/store/lifecycle-write.js";
import { WorkUnitReadPlacementSchema } from "../lib/store/placement.js";
import { workItemArtifactPath, workItemLayoutPlacement } from "../lib/store/lifecycle-storage.js";
import { recordReferences, RecordReferenceSchema, OwnerIdentitySchema, type RecordReference } from "../lib/store/identity.js";
import { familyOf, type KindId } from "../lib/store/catalog.js";
import type { StoreRecord } from "../lib/store/read.js";
import { readLifecycleDesign } from "../lib/store/lifecycle-design.js";
import { lifecycleRecordPath, cohortDocumentPath } from "../lib/store/lifecycle-record-path.js";
import { resolveArcPath, type WorkUnitArtifactKind } from "../lib/layout/index.js";
import type { ViewArtifactDependencies } from "../lib/view-artifact.js";
import type { StoreViewArtifactInput, ViewKind } from "../lib/view/types.js";
import type { ViewTargetResult } from "../lib/view/types.js";

/** Resolve a current or former work-unit slug while preserving its immutable store reference. */
export async function resolveStoreViewTarget(input: { cwd: string; store: Store; slug: string }): Promise<ViewTargetResult> {
  const read = await readWorkUnit(input.store, input.slug);
  if (read.status === "refused") {
    if (read.refusal.code === "not-found" || (read.refusal.code === "record-malformed" && read.refusal.rule === "lifecycle.work-unit")) return { status: "unavailable", slug: input.slug };
    const completed = read.refusal.code === "ambiguous-match" ? " Open a completed holder through its projected file under completed/." : "";
    return { status: "unavailable", slug: input.slug, message: `${read.refusal.condition} ${read.refusal.remedy.text}${completed}` };
  }
  return targetFromMeta(input.cwd, read.result);
}

function targetFromMeta(cwd: string, meta: StoreRecord): ViewTargetResult {
  const fields = readLifecycleMetaFields(meta);
  if (fields.status === "refused") throw new Error(`${fields.refusal.condition} ${fields.refusal.remedy.text}`);
  const placement = WorkUnitReadPlacementSchema.parse(meta.placement), slug = meta.reference.owner.name;
  const path = (artifact: "meta" | "tasks"): string => resolve(cwd, workItemArtifactPath(slug, artifact, placement, fields.result.cohort));
  return { status: "resolved", slug, placement: workItemLayoutPlacement(placement, fields.result.cohort),
    location: placement.kind === "backlog" ? placement.commitment : placement.kind,
    metaPath: path("meta"), taskListPath: fields.result.taskList === null ? null : path("tasks"),
    artifactSource: { kind: "store", reference: meta.reference } };
}


/** Refresh the resolved checkout claim by its exact reference, retaining identity across placement changes. */
export async function resolveStoreAmbientViewTarget(input: { cwd: string; store: Store }): Promise<ViewTargetResult> {
  const current = await resolveCurrentWorkUnit(input);
  if (current.status === "resolved") {
    const read = await input.store.read({ reference: current.candidate.reference });
    return read.status === "ok" ? targetFromMeta(input.cwd, read.result) : {
      status: "unavailable", slug: current.candidate.reference.owner.name,
      message: `${read.refusal.condition} ${read.refusal.remedy.text}`,
    };
  }
  const candidates = current.status === "ambiguous"
    ? [`Candidates: ${current.candidates.map(candidate => JSON.stringify(candidate.reference)).join(", ")}.`] : [];
  return { status: "unavailable", message: ["No work-unit claim resolved for this checkout.", ...current.warnings, ...candidates,
    "Use arc view <kind> --for <slug> to open a work unit's artifacts."].join(" ") };
}


interface StoreViewSelection { record: StoreRecord; path: string; warnings?: string[] }
interface StoreViewSelectionInput { store: Store; cwd: string; request: StoreViewArtifactInput }
type StoreViewSelector = (input: StoreViewSelectionInput) => Promise<StoreViewSelection | null>;
const STORE_VIEW_SELECTORS: Record<ViewKind, StoreViewSelector> = {
  meta: ownRecord("work-item/meta", "meta"),
  tasks: ownRecord("work-item/task-list", "tasks"),
  spec: ownRecord("work-item/spec", "spec"),
  draft: ownRecord("work-item/draft", "draft"),
  notes: ownRecord("work-item/notes", "notes"),
  "session-notes": ownRecord("work-item/meta", "meta"),
  design: selectDesign,
  cohort: selectCohort,
  "working-memory": personalRecord("personal/working-memory"),
  inbox: selectInbox,
};

/** Bind one typed selector table to the invocation's store and checkout root. */
export function createStoreViewArtifactReader(input: { cwd: string; store: Store }): NonNullable<ViewArtifactDependencies["readStoreArtifact"]> {
  return async request => {
    try {
      const selected = await STORE_VIEW_SELECTORS[request.kind]({ ...input, request });
      if (selected === null) return { status: "absent" };
      return { status: "found", path: selected.path, content: selected.record.content, version: selected.record.version,
        conflicts: selected.record.conflicts, warnings: selected.warnings ?? [] };
    } catch (error) { return { status: "error", message: error instanceof Error ? error.message : String(error) }; }
  };
}
function ownRecord(kind: KindId, artifact: WorkUnitArtifactKind): StoreViewSelector {
  return async input => {
    const primary = await readPrimary(input);
    if (primary === null) return null;
    const fields = metaFields(primary), placement = WorkUnitReadPlacementSchema.parse(primary.placement);
    const record = kind === "work-item/meta" ? primary : await readRecord(input.store,
      RecordReferenceSchema.parse({ kind, owner: primary.reference.owner }));
    return record === null ? null : { record, path: resolve(input.cwd,
      workItemArtifactPath(primary.reference.owner.name, artifact, placement, fields.cohort)) };
  };
}
async function readPrimary(input: StoreViewSelectionInput): Promise<StoreRecord | null> {
  const source = input.request.target?.artifactSource;
  if (source?.kind !== "store") throw new Error("A store-backed work-unit target is required.");
  return readRecord(input.store, source.reference);
}
function metaFields(record: StoreRecord) {
  const fields = readLifecycleMetaFields(record);
  if (fields.status === "refused") throw new Error(`${fields.refusal.condition} ${fields.refusal.remedy.text}`);
  return fields.result;
}
async function readRecord(store: Store, reference: RecordReference): Promise<StoreRecord | null> {
  const read = await store.read({ reference });
  if (read.status === "ok") return read.result;
  if (read.refusal.code === "not-found") return null;
  throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
}
async function selectDesign(input: StoreViewSelectionInput): Promise<StoreViewSelection | null> {
  const primary = await readPrimary(input);
  if (primary === null) return null;
  const design = await readLifecycleDesign(input.store, primary);
  if (design.record === null) {
    if (design.warnings.length > 0) throw new Error(`${design.warnings.join(" ")} Repair the design inventory, then retry arc view design --for ${primary.reference.owner.name}.`);
    return null;
  }
  const path = lifecycleRecordPath(primary, design.record);
  return path === null ? null : { record: design.record, path: resolve(input.cwd, path), warnings: design.warnings };
}
async function selectCohort(input: StoreViewSelectionInput): Promise<StoreViewSelection | null> {
  const primary = await readPrimary(input);
  if (primary === null) return null;
  const name = metaFields(primary).cohort?.split("/").at(-1);
  if (name === undefined) return null;
  const record = await readRecord(input.store, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })));
  return record === null ? null : { record, path: resolve(input.cwd, cohortDocumentPath(record)) };
}
function personalRecord(kind: KindId): StoreViewSelector {
  return async input => {
    const identity = input.request.identity;
    if (identity === null) throw new Error("No ARC identity is configured for this identity-scoped artifact.");
    const owner = OwnerIdentitySchema.parse({ type: "person", name: identity });
    const record = await readRecord(input.store, RecordReferenceSchema.parse({ owner, kind }));
    const path = kind === "personal/working-memory"
      ? resolveArcPath({ kind: "user-document", identity: owner.name, document: { kind: "working-memory" } })
      : resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity: owner.name } });
    return record === null ? null : { record, path: resolve(input.cwd, path) };
  };
}
async function selectInbox(input: StoreViewSelectionInput): Promise<StoreViewSelection | null> {
  if (!input.request.project) return personalRecord("personal/inbox")(input);
  const record = await readSingleton(input.store, "project-inbox/inbox");
  return record === null ? null : { record, path: resolve(input.cwd, resolveArcPath({ kind: "inbox", scope: { kind: "project" } })) };
}
async function readSingleton(store: Store, kind: KindId): Promise<StoreRecord | null> {
  const family = familyOf(kind), listed = await store.list({ family, kind });
  if (listed.status === "refused") throw new Error(`${listed.refusal.condition} ${listed.refusal.remedy.text}`);
  const value = listed.result;
  if (value.status === "absent") return null;
  if (value.status === "unreadable") throw new Error(`${value.condition} ${value.remedy.text}`);
  if (value.missed || value.diagnostics.length > 0) {
    const condition = value.diagnostics.map(item => `${item.key}: ${item.condition} ${item.remedy.text}`).join(" ") || `${family} inventory is incomplete.`;
    throw new Error(`${condition} Repair the ${family} inventory, then retry arc view inbox --project.`);
  }
  if (value.records.length > 1) throw new Error("More than one project inbox was listed. Repair the project inbox namespace, then retry arc view inbox --project.");
  return value.records[0] ?? null;
}
