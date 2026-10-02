/** Storage grouping and record mechanisms as role-based, backend-independent data. */

import { FAMILY_IDS, KIND_SHAPES, familyOf, type FamilyId, type KindId } from "./catalog.js";

/** Pure family parser outcome; defects remain thrown rather than disguised as refusals. */
export type RecordParser = (content: string) => { success: true; data: unknown } | { success: false; error: string };
/** Physical substrate used by the interim backend, including records not yet housed. */
export type InRepoHome = {
  substrate: "tracked" | "personal" | "transient-identity" | "none";
  address?: { kind: string; artifact?: string; document?: string; pending?: true };
  finder?: "companions" | "personal-documents" | "transient-records";
};
/** Pure generic entry shape and the sections in which entries live. */
export interface EntryConfig { shape: "heading" | "field-header"; sections: readonly string[] }
/** Kind-specific storage and projection mechanism, excluding its field schema. */
export interface KindMechanism {
  merge: "single-writer" | "line" | "entry";
  writerRule: "cas" | "single-writer" | "create-only" | "write-once";
  writerVerbs?: readonly string[];
  projection: "never" | "projection-defined" | { kind: string; artifact?: string; document?: string };
  inRepo: InRepoHome;
  entry?: EntryConfig;
  interim?: true;
}
const unhomed = { substrate: "none" } as const;
const never = { projection: "never" } as const;
const pendingTracked = { substrate: "tracked", address: { kind: "pending", pending: true } } as const;
const transient = { substrate: "transient-identity", finder: "transient-records" } as const;
const machine = (inRepo: InRepoHome): KindMechanism => ({ merge: "single-writer", writerRule: "single-writer", ...never, inRepo });
const prose = (inRepo: InRepoHome, projection: KindMechanism["projection"]): KindMechanism => ({ merge: "line", writerRule: "cas", projection, inRepo });
const artifact = (role: string, merge: "single-writer" | "line"): KindMechanism => ({
  merge, writerRule: merge === "line" ? "cas" : "single-writer",
  projection: { kind: "work-unit-artifact", artifact: role },
  inRepo: { substrate: "tracked", address: { kind: "work-unit-artifact", artifact: role } },
});
const entry = (inRepo: InRepoHome, config?: EntryConfig): KindMechanism => ({
  merge: "entry", writerRule: "cas", projection: "projection-defined", inRepo,
  ...(config === undefined ? {} : { entry: config }),
});
const once: KindMechanism = {
  merge: "single-writer", writerRule: "write-once", writerVerbs: ["merge", "sync", "route", "resolve"],
  ...never, inRepo: unhomed,
};

/** Every role explicitly declares its mechanism and interim home. */
export const KIND_MECHANISMS = {
  "work-item/meta": artifact("meta", "single-writer"),
  "work-item/task-list": artifact("tasks", "single-writer"),
  "work-item/record": machine(transient),
  "work-item/draft": artifact("draft", "line"),
  "work-item/spec": artifact("spec", "line"),
  "work-item/notes": artifact("notes", "line"),
  "work-item/companion": prose({ substrate: "tracked", finder: "companions" }, "projection-defined"),
  "work-item/description": entry(unhomed),
  "work-item/inbound": entry(unhomed),
  "cohort/document": prose({ substrate: "tracked", address: { kind: "cohort-document" } }, { kind: "cohort-document" }),
  "project-inbox/inbox": entry(pendingTracked, { shape: "heading", sections: ["Inbox"] }),
  "review/candidate": machine(pendingTracked),
  "review/integration-boundary": machine(pendingTracked),
  "review/evidence": machine(unhomed),
  "review/outcome": machine(unhomed),
  "review/terminus": machine(unhomed),
  "review/adversarial-pass": machine(unhomed),
  "project-registry/identity": { ...machine(unhomed), writerRule: "create-only" },
  "project-registry/counter": { ...machine(unhomed), writerRule: "cas" },
  "lineage/transition": { ...machine(pendingTracked), writerRule: "create-only" },
  "personal/inbox": entry({ substrate: "personal", address: { kind: "pending", pending: true } }, { shape: "heading", sections: ["Errand", "Work Unit"] }),
  "personal/working-memory": { ...entry({ substrate: "personal", address: { kind: "user-document", document: "working-memory" } }, { shape: "field-header", sections: ["Memories"] }), projection: { kind: "user-document", document: "working-memory" } },
  "personal/document": prose({ substrate: "personal", finder: "personal-documents" }, "projection-defined"),
  "personal/errand-queue": entry(unhomed),
  "personal/session-context": { ...prose({ substrate: "personal", address: { kind: "user-document", document: "session-notes" } }, { kind: "user-document", document: "session-notes" }), interim: true },
  "claims/groom": machine(transient),
  "claims/housekeep": machine(transient),
  "project-machinery/prose": prose(unhomed, "projection-defined"),
  "constitution/prose": prose(unhomed, "projection-defined"),
  "work-item/conflict-record": once,
  "cohort/conflict-record": once,
  "project-inbox/conflict-record": once,
  "review/conflict-record": once,
  "project-registry/conflict-record": once,
  "lineage/conflict-record": once,
  "personal/conflict-record": once,
  "claims/conflict-record": once,
  "project-machinery/conflict-record": once,
  "constitution/conflict-record": once,
  "project-inbox/routing-receipt": once,
  "personal/routing-receipt": once,
} satisfies Record<KindId, KindMechanism>;

/** A registered role with a replaceable parser slot and ordered format. */
export interface KindDefinition extends KindMechanism {
  id: KindId;
  family: FamilyId;
  owner: typeof KIND_SHAPES[KindId]["owner"];
  key: typeof KIND_SHAPES[KindId]["key"];
  formatVersion: number;
  parser: RecordParser | null;
}
/** Ref ownership; subtree declarations are the only permitted ref sharing. */
export type RefPlacement = { pattern: string } | { subtreeOf: FamilyId; path: string } | null;
/** Family-owned retention, sync, lifecycle, and install assignment. */
export interface FamilyDefinition {
  id: FamilyId;
  scope: "project" | "identity";
  ref: RefPlacement;
  retention: "archive-and-history" | "permanent";
  sync: "project" | "identity";
  lifecycle: "work-item" | "cohort" | "claim" | "permanent";
  profiles: { standard: "stored" | "tracked"; ghost: "stored" };
  reserved: boolean;
}
const stored = { standard: "stored", ghost: "stored" } as const;
const project = { scope: "project", sync: "project", retention: "permanent", lifecycle: "permanent", profiles: stored, reserved: false } as const;
const personal = { ...project, scope: "identity", sync: "identity" } as const;
/** Family properties derive the backend layout, fixture coverage, and migration map. */
export const FAMILY_REGISTRY: Readonly<Record<FamilyId, FamilyDefinition>> = {
  "work-item": { ...project, id: "work-item", ref: { pattern: "refs/arc/work/<uid>" }, retention: "archive-and-history", lifecycle: "work-item" },
  cohort: { ...project, id: "cohort", ref: { pattern: "refs/arc/cohort/<uid>" }, retention: "archive-and-history", lifecycle: "cohort" },
  "project-inbox": { ...project, id: "project-inbox", ref: { pattern: "refs/arc/project/inbox" } },
  review: { ...project, id: "review", ref: { subtreeOf: "work-item", path: "review" } },
  "project-registry": { ...project, id: "project-registry", ref: { pattern: "refs/arc/project/registry" } },
  lineage: { ...project, id: "lineage", ref: { subtreeOf: "project-registry", path: "lineage" } },
  personal: { ...personal, id: "personal", ref: { pattern: "refs/arc/user/<id>/personal" } },
  claims: { ...personal, id: "claims", ref: { pattern: "refs/arc/user/<id>/claims" }, lifecycle: "claim" },
  "project-vector": { ...project, id: "project-vector", ref: null, reserved: true },
  "user-vector": { ...personal, id: "user-vector", ref: null, reserved: true },
  "user-configuration": { ...personal, id: "user-configuration", ref: null, reserved: true },
  "project-machinery": { ...project, id: "project-machinery", ref: null, profiles: { standard: "tracked", ghost: "stored" } },
  constitution: { ...project, id: "constitution", ref: null, profiles: { standard: "tracked", ghost: "stored" } },
};

/** Build an isolated registry with only caller-registered field parsers.
 * @param parsers - Parsers installed by the code rerouting each record family.
 * @returns All role definitions with their independent parser slots.
 */
export function createKindRegistry(parsers: Partial<Record<KindId, RecordParser>> = {}): Readonly<Record<KindId, KindDefinition>> {
  return Object.fromEntries((Object.keys(KIND_SHAPES) as KindId[]).map((id) => [id, {
    id, family: familyOf(id), ...KIND_SHAPES[id], ...KIND_MECHANISMS[id], formatVersion: 1, parser: parsers[id] ?? null,
  }])) as Record<KindId, KindDefinition>;
}
/** Default registry keeps parser slots empty until their consumers are rerouted. */
export const KIND_REGISTRY = createKindRegistry();
/** Machine-scoped locations never stored, synced, or projected. */
export const MACHINE_LOCAL_PATHS = [
  { root: "user", pattern: "<identity>/.internal/**" },
  { root: "git-common", pattern: ".notes.lock" },
  { root: "git-common", pattern: ".machine-id" },
  { root: "git-common", pattern: "arc/**" },
] as const;
/** Status and archive listings are derived, never state records. */
export const DERIVED_VIEWS = ["project-status", "identity-status", "archive-index"] as const;
/** All registered families, including reserved roles with no kinds. */
export const STORE_FAMILIES = FAMILY_IDS.map((id) => FAMILY_REGISTRY[id]);
