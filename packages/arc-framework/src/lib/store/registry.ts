/** Storage grouping and record mechanisms as role-based, backend-independent data. */

import { ENTRY_CONFIGS } from "./kinds/entry-configs.js";
import { FAMILY_IDS, KIND_SHAPES, familyOf, type FamilyId, type KindId } from "./catalog.js";
import type { StateVersion } from "./identity.js";
import type { WriteCheck } from "./write-check.js";

/** Pure family parser outcome; defects remain thrown rather than disguised as refusals. */
export type RecordParser = (content: string) => { success: true; data: unknown } | { success: false; error: string };
/** Parsed keys that hold an opaque saved-state anchor. */
export type AnchorField<Fields> = { [K in keyof Fields]: Fields[K] extends StateVersion | null ? K : never }[keyof Fields];
/** One kind's parser, rules, and typed anchor declarations. */
export interface KindRegistration<Fields> {
  kind: KindId;
  parser?: (content: string) => { success: true; data: Fields } | { success: false; error: string };
  check?: WriteCheck;
  anchorFields?: readonly AnchorField<Fields>[];
}
/** A checked registration with its parsed-field type erased for heterogeneous lists. */
export interface RegisteredKind {
  kind: KindId;
  parser?: RecordParser;
  check?: WriteCheck;
  anchorFields?: readonly string[];
}
/** Type-check anchors against the parser's output before storing a registration.
 * @param registration - One kind's typed declarations.
 * @returns The declarations with their field type erased.
 */
export function defineKindRegistration<Fields>(registration: KindRegistration<Fields>): RegisteredKind {
  return registration as RegisteredKind;
}
/** Partial semantic address; the backend supplies its record name, placement, or identity.
 * Scope is a family role, never a physical filename or checkout path.
 */
export interface LayoutRoleDescriptor {
  kind: string;
  artifact?: string;
  document?: string;
  scope?: "project" | "identity";
}
/** Physical substrate used by the interim backend, including records not yet housed. */
export type InRepoHome = {
  substrate: "tracked" | "personal" | "transient-identity" | "none";
  address?: LayoutRoleDescriptor;
  finder?: "companions" | "personal-documents" | "transient-records";
};
/** Pure generic entry shape and the sections in which entries live. */
export interface EntryConfig { shape: "heading" | "field-header"; sections: readonly string[]; managedFields?: readonly string[] }
/** Where the ref backend stores one kind's records inside its family's ref. */
export interface RefHome {
  /** Path template; `<slug>`, `<uid>`, `<person>`, and `<key>` expand from the record's reference. */
  path: string;
}
/** Kind-specific storage and projection mechanism, excluding its field schema. */
export interface KindMechanism {
  merge: "single-writer" | "line" | "entry";
  writerRule: "cas" | "single-writer" | "create-only" | "write-once";
  writerVerbs?: readonly string[];
  projection: "never" | "projection-defined" | LayoutRoleDescriptor;
  inRepo: InRepoHome;
  ref?: RefHome;
  entry?: EntryConfig;
  interim?: true;
}
const unhomed = { substrate: "none" } as const;
const never = { projection: "never" } as const;
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

const receipt: KindMechanism = { ...once, writerVerbs: ["merge", "sync", "route", "resolve", "errand-open", "errand-link", "errand-abandon"] };

const atRef = (path: string, mechanism: KindMechanism): KindMechanism => ({ ...mechanism, ref: { path } });

/** Every role explicitly declares its mechanism and storage homes. */
export const KIND_MECHANISMS = {
  "work-item/meta": atRef("meta-<slug>.md", artifact("meta", "single-writer")),
  "work-item/task-list": atRef("tasks-<slug>.md", artifact("tasks", "single-writer")),
  "work-item/record": atRef("errand-<uid>.json", machine(transient)),
  "work-item/draft": atRef("draft-<slug>.md", artifact("draft", "line")),
  "work-item/spec": atRef("spec-<slug>.md", artifact("spec", "line")),
  "work-item/notes": atRef("notes-<slug>.md", artifact("notes", "line")),
  "work-item/companion": atRef("<key>-<slug>.md", prose({ substrate: "tracked", finder: "companions" }, "projection-defined")),
  "work-item/description": atRef("errand-<slug>.md", entry(unhomed, ENTRY_CONFIGS["work-item/description"])),
  "work-item/inbound": atRef("inbound-<slug>.md", entry(unhomed, ENTRY_CONFIGS["work-item/inbound"])),
  "cohort/document": atRef("cohort-<slug>.md", prose({ substrate: "tracked", address: { kind: "cohort-document" } }, { kind: "cohort-document" })),
  "project-inbox/inbox": atRef("ATOMIC-INBOX.md", { ...entry({ substrate: "tracked", address: { kind: "inbox", scope: "project" } }, ENTRY_CONFIGS["project-inbox/inbox"]), projection: { kind: "inbox", scope: "project" } }),
  "review/candidate": atRef("review/candidate-<uid>.json", machine({ substrate: "tracked", address: { kind: "candidate-record" } })),
  "review/integration-boundary": atRef("review/integration-boundary-<uid>.json", machine({ substrate: "tracked", address: { kind: "integration-boundary-record" } })),
  "review/evidence": atRef("review/evidence-<key>-<uid>.json", machine(unhomed)),
  "review/outcome": atRef("review/outcome-<key>-<uid>.json", machine(unhomed)),
  "review/terminus": atRef("review/terminus-<key>-<uid>.json", machine(unhomed)),
  "review/adversarial-pass": atRef("review/adversarial-pass-<key>-<uid>.json", machine(unhomed)),
  "project-registry/identity": atRef("identity.json", { ...machine(unhomed), writerRule: "create-only" }),
  "project-registry/counter": atRef("counters/<key>.json", { ...machine(unhomed), writerRule: "cas" }),
  "lineage/transition": atRef("lineage/<uid>.json", { ...machine({ substrate: "tracked", address: { kind: "transition-record" } }), writerRule: "create-only" }),
  "personal/inbox": atRef("<person>/USER-INBOX.md", { ...entry({ substrate: "personal", address: { kind: "inbox", scope: "identity" } }, ENTRY_CONFIGS["personal/inbox"]), projection: { kind: "inbox", scope: "identity" } }),
  "personal/working-memory": atRef("<person>/WORKING-MEMORY.md", { ...entry({ substrate: "personal", address: { kind: "user-document", document: "working-memory" } }, ENTRY_CONFIGS["personal/working-memory"]), projection: { kind: "user-document", document: "working-memory" } }),
  "personal/document": atRef("<person>/<key>", prose({ substrate: "personal", finder: "personal-documents" }, "projection-defined")),
  "personal/errand-queue": atRef("<person>/errand-queue-<person>.md", entry(unhomed, ENTRY_CONFIGS["personal/errand-queue"])),
  "personal/session-context": atRef("<person>/<key>/SESSION-NOTES.md", { ...prose({ substrate: "personal", address: { kind: "user-document", document: "session-notes" } }, { kind: "user-document", document: "session-notes" }), interim: true }),
  "claims/groom": atRef("groom-<key>-<person>.json", machine(transient)),
  "claims/housekeep": atRef("housekeep-<key>-<person>.json", machine(transient)),
  "project-machinery/prose": prose(unhomed, "projection-defined"),
  "constitution/prose": prose(unhomed, "projection-defined"),
  "work-item/conflict-record": atRef("conflicts/<key>.json", once),
  "cohort/conflict-record": atRef("conflicts/<key>.json", once),
  "project-inbox/conflict-record": atRef("conflicts/<key>.json", once),
  "review/conflict-record": atRef("review/conflicts/<key>.json", once),
  "project-registry/conflict-record": atRef("conflicts/<key>.json", once),
  "lineage/conflict-record": atRef("lineage/conflicts/<key>.json", once),
  "personal/conflict-record": atRef("<person>/conflicts/<key>.json", once),
  "claims/conflict-record": atRef("conflicts/<key>.json", once),
  "project-machinery/conflict-record": once,
  "constitution/conflict-record": once,
  "project-inbox/routing-receipt": atRef("receipts/<key>.json", receipt),
  "personal/routing-receipt": atRef("<person>/receipts/<key>.json", receipt),
} satisfies Record<KindId, KindMechanism>;

/** A registered role with a replaceable parser slot and ordered format. */
export interface KindDefinition extends KindMechanism {
  id: KindId;
  family: FamilyId;
  owner: typeof KIND_SHAPES[KindId]["owner"];
  key: typeof KIND_SHAPES[KindId]["key"];
  formatVersion: number;
  parser: RecordParser | null;
  check: WriteCheck | null;
  anchorFields: readonly string[];
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

/** Build an isolated registry from one registration per kind.
 * @param registrations - Kind parsers, checks, and anchor declarations.
 * @returns All role definitions with independent registration slots.
 */
export function createKindRegistry(registrations: readonly RegisteredKind[] = []): Readonly<Record<KindId, KindDefinition>> {
  const byKind = new Map<KindId, RegisteredKind>();
  for (const registration of registrations) {
    if (byKind.has(registration.kind)) throw new Error(`Duplicate kind registration: ${registration.kind}`);
    byKind.set(registration.kind, registration);
  }
  return Object.fromEntries((Object.keys(KIND_SHAPES) as KindId[]).map((id): [KindId, KindDefinition] => [id, {
    id, family: familyOf(id), ...KIND_SHAPES[id], ...KIND_MECHANISMS[id], formatVersion: 1,
    parser: byKind.get(id)?.parser ?? null, check: byKind.get(id)?.check ?? null,
    anchorFields: [...(byKind.get(id)?.anchorFields ?? [])],
  }])) as Record<KindId, KindDefinition>;
}
/** Default registry keeps parser slots empty until their consumers are rerouted. */
export const KIND_REGISTRY = createKindRegistry();
/** Machine-scoped locations never stored, synced, or projected. */
export const MACHINE_LOCAL_PATHS = [
  { root: "user", pattern: "<identity>/.internal/**" },
  { root: "user", pattern: "<identity>/*/.internal/**" },
  { root: "git-common", pattern: ".notes.lock" },
  { root: "git-common", pattern: ".machine-id" },
  { root: "git-common", pattern: "arc/**" },
  { root: "git-worktree", pattern: "arc-checks/**" },
] as const;
/** Status and archive listings are derived, never state records. */
export const DERIVED_VIEWS = ["project-status", "identity-status", "archive-index"] as const;
/** All registered families, including reserved roles with no kinds. */
export const STORE_FAMILIES = FAMILY_IDS.map((id) => FAMILY_REGISTRY[id]);
