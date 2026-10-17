/** Bind interval restrictions to captured owners and each record's historical paths. */
import { RecordReferenceSchema, sameReference, type RecordReference, type OwnerIdentity } from "../identity.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { resolveRefName } from "./reference-resolution.js";
import { readLiveRefOwners } from "./live-owners.js";
import { readLineageOwners, lineageOwnerCandidates } from "./lineage-resolution.js";
import { rootFamily } from "./codec.js";
import { refKeyHome } from "./path-admission.js";
import { readHistoryPaths } from "./history-paths.js";
import type { RefChangeInterval, RefChangeWindow } from "./changes-graph.js";

/** Bind owner names from the newer frame, then the older frame when absent. */
export async function resolveChangeRestrictions(context: RefBackendContext, interval: RefChangeInterval): Promise<StoreResult<RecordReference[] | undefined>> {
  const requested = interval.input.references;
  if (!requested) return { status: "ok", result: undefined };
  const references: RecordReference[] = [];
  for (const reference of requested) {
    if (reference.kind.startsWith("lineage/")) { references.push(reference); continue; }
    let found = await resolveRefName(context, reference, interval.after);
    if (found.status === "refused" && found.refusal.code === "not-found") found = await resolveRefName(context, reference, interval.before);
    if (found.status === "refused") return found;
    references.push(found.result);
  }
  return resolveLineageRestrictions(context, interval, references);
}

async function resolveLineageRestrictions(context: RefBackendContext, interval: RefChangeInterval,
  requested: RecordReference[]): Promise<StoreResult<RecordReference[] | undefined>> {
  if (!requested.some((reference) => reference.kind === "lineage/transition" && reference.owner.type === "work-item" && !reference.owner.uid)) return { status: "ok", result: requested };
  const newer = await restrictionOwners(context, interval.after), older = await restrictionOwners(context, interval.before);
  if (newer.status === "refused") return newer;
  if (older.status === "refused") return older;
  const references: RecordReference[] = [];
  for (const reference of requested) {
    if (reference.kind !== "lineage/transition" || reference.owner.type !== "work-item" || reference.owner.uid) { references.push(reference); continue; }
    const skipped = [...newer.result.unreadable].find(([ref]) => ref.startsWith("refs/arc/work/"))?.[1];
    if (skipped && !newer.result.live.some((owner) => owner.type === "work-item" && owner.name === reference.owner.name)) return { status: "refused", refusal: skipped };
    const current = lineageOwnerCandidates(reference, newer.result.live, newer.result.lineage);
    const candidates = current.length ? current : lineageOwnerCandidates(reference, older.result.live, older.result.lineage);
    if (candidates.length > 1) return { status: "refused", refusal: { code: "ambiguous-match", class: "recoverable",
      candidates: candidates.map((owner) => RecordReferenceSchema.parse({ ...reference, owner })), condition: "More than one compared lineage origin holds this name.",
      remedy: { text: "Name the intended origin by UID, then retry the comparison." } } };
    const owner = candidates[0];
    if (!owner) return { status: "refused", refusal: { code: "not-found", class: "recoverable", reference,
      condition: "Neither compared state holds this lineage origin.", remedy: { text: "Name the origin by UID or compare states that hold it, then retry." } } };
    references.push(RecordReferenceSchema.parse({ ...reference, owner }));
  }
  return { status: "ok", result: references };
}

async function restrictionOwners(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<StoreResult<{ live: OwnerIdentity[]; lineage: OwnerIdentity[]; unreadable: ReadonlyMap<string, StoreRefusal> }>> {
  const [live, lineage] = await Promise.all([readLiveRefOwners(context, tips), readLineageOwners(context, tips)]);
  if (live.status === "refused") return live;
  if (lineage.status === "refused") return lineage;
  return { status: "ok", result: { live: live.result.owners.map(({ owner }) => owner), lineage: lineage.result, unreadable: live.result.unreadable } };
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
