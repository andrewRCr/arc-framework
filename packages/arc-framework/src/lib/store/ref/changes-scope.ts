/** Bind interval restrictions to captured owners and each record's historical paths. */
import { RecordReferenceSchema, sameReference, type RecordReference, type OwnerIdentity } from "../identity.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { resolveRefName } from "./reference-resolution.js";
import { readLiveRefOwners, type LiveRefOwnerEvidence } from "./live-owners.js";
import { readLineageOwners, lineageOwnerCandidates } from "./lineage-resolution.js";
import { rootFamily } from "./codec.js";
import { refKeyHome } from "./path-admission.js";
import { readHistoryPaths } from "./history-paths.js";
import type { RefChangeInterval, RefChangeWindow } from "./changes-graph.js";
import { projectIdentityQueries, projectOwnerFromObjects, admitProjectReference } from "./project-identity.js";
import { readBatchObjects } from "./batch-read.js";

/** Bind owner names from the newer frame, then the older frame when absent. */
export async function resolveChangeRestrictions(context: RefBackendContext, interval: RefChangeInterval): Promise<StoreResult<RecordReference[] | undefined>> {
  const requested = interval.input.references;
  if (!requested) return { status: "ok", result: undefined };
  const project = await changeRestrictionProject(context, interval, requested);
  if (project.status === "refused") return project;
  const references: RecordReference[] = [];
  for (const reference of requested) {
    if (reference.kind.startsWith("lineage/")) { references.push(reference); continue; }
    let found = await resolveRefName(context, reference, interval.after, false, true);
    if (found.status === "refused" && found.refusal.code === "not-found") found = await resolveRefName(context, reference, interval.before, false, true);
    if (found.status === "refused") return found;
    if (project.result) {
      found = admitProjectReference(found.result, project.result);
      if (found.status === "refused") return found;
    }
    references.push(found.result);
  }
  return resolveLineageRestrictions(context, interval, references);
}

async function changeRestrictionProject(context: RefBackendContext, interval: RefChangeInterval,
  requested: readonly RecordReference[]): Promise<StoreResult<OwnerIdentity | undefined>> {
  if (!requested.some(({ owner }) => owner.type === "project")) return { status: "ok", result: undefined };
  return projectOwnerFromObjects(interval.after, await readBatchObjects(context, projectIdentityQueries(interval.after)), true);
}

async function resolveLineageRestrictions(context: RefBackendContext, interval: RefChangeInterval,
  requested: RecordReference[]): Promise<StoreResult<RecordReference[] | undefined>> {
  if (!requested.some(unresolvedLineageReference)) return { status: "ok", result: requested };
  const newer = await restrictionOwners(context, interval.after), older = await restrictionOwners(context, interval.before);
  if (newer.status === "refused") return newer;
  if (older.status === "refused") return older;
  const references: RecordReference[] = [];
  for (const reference of requested) {
    if (!unresolvedLineageReference(reference)) { references.push(reference); continue; }
    const resolved = resolveComparedLineageReference(reference, newer.result, older.result);
    if (resolved.status === "refused") return resolved;
    references.push(resolved.result);
  }
  return { status: "ok", result: references };
}

function unresolvedLineageReference(reference: RecordReference): boolean {
  return reference.kind === "lineage/transition" && reference.owner.type === "work-item" && !reference.owner.uid;
}

interface LineageRestrictionOwners {
  live: readonly LiveRefOwnerEvidence[]; lineage: readonly OwnerIdentity[]; unreadable: ReadonlyMap<string, StoreRefusal>;
}

/** Keep each compared endpoint's complete authority evidence until its winning owner is established. */
function resolveComparedLineageReference(reference: RecordReference, newer: LineageRestrictionOwners,
  older: LineageRestrictionOwners): StoreResult<RecordReference> {
  const skipped = unreadableLineageRestriction(reference, newer);
  if (skipped) return { status: "refused", refusal: skipped };
  const current = lineageOwnerCandidates(reference, newer.live, newer.lineage);
  const skippedOlder = current.length ? undefined : unreadableLineageRestriction(reference, older);
  if (skippedOlder) return { status: "refused", refusal: skippedOlder };
  const candidates = current.length ? current : lineageOwnerCandidates(reference, older.live, older.lineage);
  if (candidates.length > 1) return { status: "refused", refusal: { code: "ambiguous-match", class: "recoverable",
    candidates: candidates.map((owner) => RecordReferenceSchema.parse({ ...reference, owner })), condition: "More than one compared lineage origin holds this name.",
    remedy: { text: "Name the intended origin by UID, then retry the comparison." } } };
  const owner = candidates[0];
  if (!owner) return { status: "refused", refusal: { code: "not-found", class: "recoverable", reference,
    condition: "Neither compared state holds this lineage origin.", remedy: { text: "Name the origin by UID or compare states that hold it, then retry." } } };
  return { status: "ok", result: RecordReferenceSchema.parse({ ...reference, owner }) };
}

/** Unknown live current ownership blocks a lower tier in either compared capture. */
function unreadableLineageRestriction(reference: RecordReference, captured: Pick<LineageRestrictionOwners, "live" | "unreadable">): StoreRefusal | undefined {
  const skipped = [...captured.unreadable].find(([ref]) => ref.startsWith("refs/arc/work/"))?.[1];
  return skipped && !captured.live.some(({ owner }) => owner.type === "work-item" && owner.name === reference.owner.name) ? skipped : undefined;
}

async function restrictionOwners(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<StoreResult<LineageRestrictionOwners>> {
  const [live, lineage] = await Promise.all([readLiveRefOwners(context, tips, true), readLineageOwners(context, tips, true)]);
  if (live.status === "refused") return live;
  if (lineage.status === "refused") return lineage;
  return { status: "ok", result: { live: live.result.owners, lineage: lineage.result, unreadable: live.result.unreadable } };
}

/** Whether a restriction needs logical work-item histories rather than only shared registry records. */
export function needsLifecycleWindows(context: RefBackendContext, references: readonly RecordReference[] | undefined): boolean {
  return references === undefined || references.some(({ kind }) => ["work-item", "cohort"].includes(rootFamily(context.registry[kind].family)));
}

/** Skip an unrelated ended owner's history when every requested owner is authoritative by UID. */
export function includesLifecycleOwner(context: RefBackendContext, references: readonly RecordReference[] | undefined, live: string): boolean {
  return references === undefined || references.some((reference) => {
    if (!["work-item", "cohort"].includes(rootFamily(context.registry[reference.kind].family))) return false;
    return !("uid" in reference.owner) || !reference.owner.uid || refKeyHome(reference, context.registry).ref === live;
  });
}

/** Bind an unresolved name only after a captured record supplies its concrete owner. */
export function matchesChangeRestriction(requested: RecordReference, actual: RecordReference): boolean {
  if (sameReference(requested, actual)) return true;
  if (requested.owner.type !== actual.owner.type || "uid" in requested.owner && requested.owner.uid
    || requested.owner.name !== actual.owner.name) return false;
  return sameReference(RecordReferenceSchema.parse({ ...requested, owner: actual.owner }), actual);
}

/** Return null for an unrelated ref and literal path limits for concrete requested records. */
export async function restrictedChangeWindow(context: RefBackendContext, window: RefChangeWindow,
  references: readonly RecordReference[] | undefined): Promise<RefChangeWindow | null> {
  if (references === undefined) return window;
  const live = window.ref.replace("refs/arc/history/", "refs/arc/");
  const unresolved = references.some((reference) => ["work-item", "cohort"].includes(rootFamily(context.registry[reference.kind].family))
    && "uid" in reference.owner && !reference.owner.uid);
  if (unresolved) return window;
  const own = references.filter((reference) => refKeyHome(reference, context.registry).ref === live);
  if (!own.length) return null;
  const paths = await Promise.all(own.map((reference) => readHistoryPaths(context, reference,
    { ...refKeyHome(reference, context.registry), ref: window.ref }, window.upper)));
  return { ...window, paths: [...new Set(paths.flat())] };
}
