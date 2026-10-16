import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type RecordReference } from "../../../../src/lib/store/identity.js";
import { KIND_REGISTRY } from "../../../../src/lib/store/registry.js";
import type { KindId } from "../../../../src/lib/store/catalog.js";
import { expandStoredPath } from "../../../../src/lib/store/stored-path.js";
import { ReadPlacementSchema } from "../../../../src/lib/store/placement.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const paths: Partial<Record<KindId, string>> = {
  "work-item/meta": "meta-alpha.md", "work-item/task-list": "tasks-alpha.md",
  "work-item/record": `errand-${uid}.json`, "work-item/draft": "draft-alpha.md",
  "work-item/spec": "spec-alpha.md", "work-item/notes": "notes-alpha.md",
  "work-item/companion": "extra-alpha.md", "work-item/description": "errand-alpha.md",
  "work-item/inbound": "inbound-alpha.md", "cohort/document": "cohort-alpha.md",
  "project-inbox/inbox": "ATOMIC-INBOX.md", "review/candidate": `review/candidate-${uid}.json`,
  "review/integration-boundary": `review/integration-boundary-${uid}.json`,
  "review/evidence": `review/evidence-event-${uid}.json`, "review/outcome": `review/outcome-event-${uid}.json`,
  "review/terminus": `review/terminus-event-${uid}.json`,
  "review/adversarial-pass": `review/adversarial-pass-design-2-${uid}.json`,
  "project-registry/identity": "identity.json", "project-registry/counter": "counters/extra.json",
  "lineage/transition": `lineage/${uid}.json`, "personal/inbox": "andrew/USER-INBOX.md",
  "personal/working-memory": "andrew/WORKING-MEMORY.md", "personal/document": "andrew/extra",
  "personal/errand-queue": "andrew/errand-queue-andrew.md",
  "personal/session-context": "andrew/extra/SESSION-NOTES.md", "claims/groom": "groom-extra-andrew.json",
  "claims/housekeep": "housekeep-extra-andrew.json", "work-item/conflict-record": "conflicts/event.json",
  "cohort/conflict-record": "conflicts/event.json", "project-inbox/conflict-record": "conflicts/event.json",
  "review/conflict-record": "review/conflicts/event.json", "project-registry/conflict-record": "conflicts/event.json",
  "lineage/conflict-record": "lineage/conflicts/event.json", "personal/conflict-record": "andrew/conflicts/event.json",
  "claims/conflict-record": "conflicts/event.json", "project-inbox/routing-receipt": "receipts/event.json",
  "personal/routing-receipt": "andrew/receipts/event.json",
};
function reference(kind: KindId, key?: string): RecordReference {
  const def = KIND_REGISTRY[kind];
  return RecordReferenceSchema.parse({ kind,
    owner: def.owner === "person" ? { type: "person", name: "andrew" }
      : { type: def.owner, name: def.owner === "project" ? "project" : "alpha", uid },
    ...(def.key === null ? {} : { key: key ?? (def.key === "pass" ? { activity: "design", number: 2 }
      : def.key === "id" ? "event" : "extra") }),
  });
}
function expectedRef(kind: KindId): string {
  const family = KIND_REGISTRY[kind].family;
  return family === "work-item" || family === "review" ? `refs/arc/work/${uid}`
    : family === "cohort" ? `refs/arc/cohort/${uid}`
      : family === "personal" || family === "claims" ? `refs/arc/user/andrew/${family}`
        : family === "project-inbox" ? "refs/arc/project/inbox" : "refs/arc/project/registry";
}

describe("stored record homes", () => {
  it.each(Object.values(KIND_REGISTRY).filter((kind) => kind.ref))("expands $id at its registered table path", (kind) => {
    expect(paths[kind.id]).toBeDefined();
    const home = expandStoredPath(reference(kind.id));
    expect({ ref: home.ref, path: home.path }).toEqual({ ref: expectedRef(kind.id), path: paths[kind.id] });
  });
  it.each(Object.values(KIND_REGISTRY).filter((kind) => !kind.ref))("leaves $id without a ref home", (kind) => {
    expect(() => expandStoredPath(reference(kind.id))).toThrow(`No ref home for ${kind.id}`);
  });
  it.each([
    ["work-item/meta", "", `metadata-${uid}.json`, `state-${uid}/`],
    ["review/evidence", "review/", `metadata-${uid}.json`, `state-${uid}/`],
    ["cohort/document", "", `metadata-${uid}.json`, `state-${uid}/`],
    ["project-inbox/inbox", "", "metadata-inbox.json", "state-inbox/"],
    ["project-registry/identity", "", "metadata-registry.json", "state-registry/"],
    ["lineage/transition", "lineage/", "metadata-registry.json", "state-registry/"],
    ["personal/inbox", "andrew/", "andrew/metadata-andrew.json", "andrew/state-andrew/"],
    ["claims/groom", "", "metadata-claims-andrew.json", "state-claims-andrew/"],
  ] as const)("places %s beside the containing ref's metadata and manifest", (kind, root, metadataPath, manifestPath) => {
    const home = expandStoredPath(reference(kind));
    expect({ root: home.root, metadataPath: home.metadataPath, manifestPath: home.manifestPath })
      .toEqual({ root, metadataPath, manifestPath });
  });
  it.each(["spec-prd", "spec-rfc", "notes-extra", "diagram.svg", "sub/notes.md"])("expands companion key %s", (key) => {
    const expected = key === "spec-prd" ? "spec-alpha-prd.md" : key === "spec-rfc" ? "spec-alpha-rfc.md"
      : key === "notes-extra" ? "notes-extra-alpha.md" : key;
    expect(expandStoredPath(reference("work-item/companion", key)).path).toBe(expected);
  });
  it.each([
    ["work-item/meta", { sequence: "01" }, "01_alpha/"],
    ["work-item/record", {}, "alpha-12345678/"],
    ["review/candidate", { sequence: "01" }, "01_alpha/"],
    ["cohort/document", { sequence: "02", closeout: "a" }, "02a_cohort-alpha/"],
    ["cohort/document", { sequence: "02", closeout: "b" }, "02b_cohort-alpha/"],
  ] as const)("archives %s with %j", (kind, facts, folder) => {
    const placement = ReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q4", ...facts });
    expect(expandStoredPath(reference(kind), { placement })).toEqual({
      ref: "refs/arc/archive/2026-q4", path: `${folder}${paths[kind]}`,
      root: `${folder}${kind.startsWith("review/") ? "review/" : ""}`,
      metadataPath: `${folder}metadata-${uid}.json`, manifestPath: `${folder}state-${uid}/`,
    });
  });
  it.each(["diagram.svg", "sub/notes.md"])("keeps companion %s in its ended owner's folder", (key) => {
    const placement = ReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q4", sequence: "03" });
    expect(expandStoredPath(reference("work-item/companion", key), { placement }).path).toBe(`03_alpha/${key}`);
  });
  it.each(["work-item/meta", "review/candidate", "cohort/document"] as const)("keeps %s history unprefixed", (kind) => {
    const placement = ReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q4", sequence: "01", closeout: "a" });
    const home = expandStoredPath(reference(kind), { placement, history: true });
    expect(home).toEqual({ ref: `refs/arc/history/${kind === "cohort/document" ? "cohort" : "work"}/${uid}`,
      path: paths[kind], root: kind.startsWith("review/") ? "review/" : "",
      metadataPath: `metadata-${uid}.json`, manifestPath: `state-${uid}/` });
  });
  it("keeps every kind's expanded instances unique within and across refs", () => {
    const homes = Object.values(KIND_REGISTRY).filter((kind) => kind.ref).flatMap((kind, index) => {
      const base = reference(kind.id, kind.key === "id" ? `event-${index}` : kind.id === "personal/document" ? "extra.svg" : undefined);
      const refs = [base];
      if (base.owner.type !== "project" && kind.family !== "lineage") refs.push(RecordReferenceSchema.parse({ ...base,
        owner: base.owner.type === "person" ? { type: "person", name: "bea" }
          : { ...base.owner, name: "beta", uid: "abcdef12-1234-4234-8234-123456789abc" },
        ...(kind.key === "id" ? { key: `other-${index}` } : {}),
      }));
      return refs.map((ref) => expandStoredPath(ref));
    });
    expect(new Set(homes.map((home) => `${home.ref}:${home.path}`)).size).toBe(homes.length);
    expect(new Set(homes.map((home) => home.path)).size).toBe(homes.length);
  });
  it.each(["project-inbox/inbox", "project-registry/identity", "project-registry/counter"] as const)("keeps %s independent of a project UID", (kind) => {
      const ref = reference(kind);
      const withoutUid = RecordReferenceSchema.parse({ ...ref, owner: { type: "project", name: "project" } });
      expect(expandStoredPath(withoutUid)).toEqual(expandStoredPath(ref));
    });
  it.each(["work-item/meta", "cohort/document"] as const)("requires a resolved UID for %s", (kind) => {
    const ref = reference(kind);
    const unresolved = RecordReferenceSchema.parse({ ...ref, owner: { type: ref.owner.type, name: ref.owner.name } });
    expect(() => expandStoredPath(unresolved)).toThrow(/Resolve the UID/u);
  });
});
