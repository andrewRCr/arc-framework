/** Production registrations: the meta codec's parse outcomes, and each projected kind's parser and entry grammar. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, FAMILY_REGISTRY, KIND_MECHANISMS, type EntryConfig, type KindMechanism, type RegisteredKind }
  from "../../../../src/lib/store/registry.js";
import { familyOf, type KindId } from "../../../../src/lib/store/catalog.js";
import { PRODUCTION_REGISTRATIONS, RECORD_LINK_KINDS } from "../../../../src/lib/store/kinds/registrations.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { checkRecordLinks } from "../../../../src/lib/store/kinds/record-links.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import type { WriteCheckInput } from "../../../../src/lib/store/write-check.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { ENTRY_CONFIGS } from "../../../../src/lib/store/kinds/entry-configs.js";
import { COHORT_REGISTRATION } from "../../../../src/lib/store/kinds/cohort/registration.js";
import { classifyStoreAddress } from "../../../../src/lib/store/target-classification.js";
import { ArcLayoutAddressSchema, WorkUnitArtifactKindSchema, type ArcLayoutAddress } from "../../../../src/lib/layout/schema.js";

describe("production kind registrations", () => {
  it.each(["review/outcome", "review/decision", "review/evidence", "review/evidence-root-selection", "review/adversarial-pass",
    "review/candidate", "review/integration-boundary"] as const)("installs the %s codec and its owned write rules", (kind) => {
    const registration = createKindRegistry(PRODUCTION_REGISTRATIONS)[kind];
    expect(registration.parser?.("{")).toMatchObject({ success: false, error: expect.any(String) });
    if (kind === "review/candidate") expect(registration.check).toBeNull();
    else expect(registration.check).toBeTypeOf("function");
  });
  it("derives exactly the projecting stored kinds and preserves one registration per kind", () => {
    const derived = (Object.keys(KIND_MECHANISMS) as KindId[]).filter(kind =>
      KIND_MECHANISMS[kind].projection !== "never" && FAMILY_REGISTRY[familyOf(kind)].ref !== null
      && kind !== "personal/errand-queue");
    expect(RECORD_LINK_KINDS).toEqual(derived);
    expect([...RECORD_LINK_KINDS].sort()).toEqual([
      "work-item/meta", "work-item/task-list", "work-item/draft", "work-item/spec", "work-item/notes",
      "work-item/companion", "work-item/description", "work-item/inbound", "cohort/document", "project-inbox/inbox",
      "personal/inbox", "personal/working-memory", "personal/document", "personal/session-context",
    ].sort());
    expect(new Set(PRODUCTION_REGISTRATIONS.map(item => item.kind)).size).toBe(PRODUCTION_REGISTRATIONS.length);
    expect(() => createKindRegistry(PRODUCTION_REGISTRATIONS)).not.toThrow();
  });
  it("preserves original meta parsing, anchors, and check ordering", async () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const content = `${makeMetaFixture("example", { owner: "andrew" })}\n[x](relative.md)\n`;
    const parsed = META_REGISTRATION.parser?.(content);
    if (parsed?.success !== true) throw new Error("Expected a valid metadata fixture");
    const view = new ReferenceBackend();
    const input: WriteCheckInput = {
      reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" })),
      observations: [], writer: { kind: "hand-edit" }, before: view, after: view, next: { content, fields: parsed.data },
    };
    const original = await META_REGISTRATION.check?.(input) ?? [];
    expect(registry["work-item/meta"].parser).toBe(META_REGISTRATION.parser);
    expect(registry["work-item/meta"].anchorFields).toEqual(META_REGISTRATION.anchorFields);
    expect(await registry["work-item/meta"].check?.(input)).toEqual([...original, ...await checkRecordLinks(input)]);
  });
  it("adds a link-only check for a covered kind without its own registration", async () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const view = new ReferenceBackend();
    const input: WriteCheckInput = {
      reference: recordReferences["work-item/notes"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" })),
      observations: [], writer: { kind: "verb", verb: "pause" }, before: view, after: view,
      next: { content: "[x](relative.md)", fields: undefined },
    };
    expect(registry["work-item/notes"].parser).toBeNull();
    expect(await registry["work-item/notes"].check?.(input)).toEqual([
      expect.objectContaining({ rule: "links.relative-in-movable" }),
    ]);
  });
  it("returns the meta fields from valid core-table content", () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const parsed = registry["work-item/meta"].parser?.(makeMetaFixture("example", { owner: "andrew" }));
    expect(parsed).toMatchObject({ success: true, data: { state: "Active", owner: "andrew" } });
  });
  it("declares the parsed state-version handoff anchor", () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    expect(registry["work-item/meta"].anchorFields).toEqual(["stateAtHandoff"]);
    const content = makeMetaFixture("example", { owner: "andrew" })
      .replace("\n---", "\n- **State at Handoff:** `state-version`\n\n---");
    expect(registry["work-item/meta"].parser?.(content)).toMatchObject({
      success: true, data: { stateAtHandoff: "state-version" },
    });
  });
  it("reports a malformed core table as a content parse failure", () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const malformed = makeMetaFixture("example", { owner: "andrew" }).replace(/\| `Active`.*\n/u, "| `Active` |\n");
    expect(registry["work-item/meta"].parser?.(malformed)).toMatchObject({ success: false, error: expect.stringContaining("column-count mismatch") });
  });
});

/** Projected kinds holding free prose, whose records carry no parsed fields. */
const PARSERLESS_KINDS: readonly KindId[] = ["work-item/notes", "personal/document", "personal/session-context"];
const active = { kind: "active", scope: { kind: "project" } } as const;
/** Every layout address form, with each variant that classifies to a different stored kind. */
const ADDRESS_SAMPLES: Readonly<Record<ArcLayoutAddress["kind"], readonly unknown[]>> = {
  "arc-root": [{ kind: "arc-root" }],
  "work-unit-export": [{ kind: "work-unit-export", slug: "demo" }],
  "candidate-record": [{ kind: "candidate-record", slug: "demo" }],
  "integration-boundary-record": [{ kind: "integration-boundary-record", slug: "demo" }],
  "transition-record": [{ kind: "transition-record", origin: "former" }],
  "editor-document-root": [{ kind: "editor-document-root" }],
  "editor-document": [{ kind: "editor-document", schema: "tasks" }],
  inbox: [{ kind: "inbox", scope: { kind: "project" } }, { kind: "inbox", scope: { kind: "identity", identity: "alice" } }],
  "placement-root": [{ kind: "placement-root", tier: "active" }],
  "work-unit-container": [{ kind: "work-unit-container", placement: active, slug: "demo" }],
  "work-unit-artifact": WorkUnitArtifactKindSchema.options.map(artifact =>
    ({ kind: "work-unit-artifact", placement: active, slug: "demo", artifact })),
  "work-unit-companion": [{ kind: "work-unit-companion", placement: active, slug: "demo", key: "correction.txt" }],
  "work-unit-spec-part": (["prd", "rfc"] as const).map(part => ({ kind: "work-unit-spec-part", placement: active, slug: "demo", part })),
  "work-unit-inbound": [{ kind: "work-unit-inbound", placement: active, slug: "demo" }],
  "errand-description": [{ kind: "errand-description", placement: active, slug: "demo" }],
  "cohort-copy": [{ kind: "cohort-copy", cohort: "core", location: { kind: "own", claim: "demo", layoutActive: "nested" } }],
  "cohort-document": [{ kind: "cohort-document", cohort: ["core"], placement: { kind: "planned" } }],
  "procedure-root": [{ kind: "procedure-root", family: "workflows" }],
  "project-document": [{ kind: "project-document", document: "roadmap" }],
  "user-root": [{ kind: "user-root", identity: "alice" }],
  "scratch-document": [{ kind: "scratch-document", identity: "alice", key: "scratch/note.md" }],
  "user-document": [{ kind: "user-document", identity: "alice", document: { kind: "working-memory" } },
    { kind: "user-document", identity: "alice", document: { kind: "session-notes", workUnit: "demo" } }],
};

/** The projecting kinds a registration set leaves without a parser, the free-prose kinds aside. */
function kindsMissingParsers(registrations: readonly RegisteredKind[]): KindId[] {
  const registry = createKindRegistry(registrations);
  return RECORD_LINK_KINDS.filter(kind => registry[kind].parser === null && !PARSERLESS_KINDS.includes(kind));
}

/** The entry-merged kinds whose mechanism does not carry their declared entry grammar. */
function kindsMissingEntryGrammars(mechanisms: Readonly<Record<KindId, KindMechanism>>): KindId[] {
  const declared: Readonly<Partial<Record<KindId, EntryConfig>>> = ENTRY_CONFIGS;
  return entryKinds(mechanisms).filter(kind => declared[kind] === undefined || mechanisms[kind].entry !== declared[kind]);
}

function entryKinds(mechanisms: Readonly<Record<KindId, KindMechanism>>): KindId[] {
  return (Object.keys(mechanisms) as KindId[]).filter(kind => mechanisms[kind].merge === "entry");
}

/** The stored kinds a hand-edited projected file addresses, split by whether merge takes them as entry lists. */
function handEditableKinds(): { all: KindId[]; entryLists: KindId[] } {
  const targets = Object.entries(ADDRESS_SAMPLES).flatMap(([form, samples]) => samples.flatMap(sample => {
    const address = ArcLayoutAddressSchema.parse(sample);
    expect(address.kind).toBe(form);
    const target = classifyStoreAddress(address);
    return target === null || KIND_MECHANISMS[target.kind].projection === "never" ? [] : [target];
  }));
  return { all: [...new Set(targets.map(target => target.kind))],
    entryLists: [...new Set(targets.filter(target => target.entryList).map(target => target.kind))] };
}

/** The hand-editable kinds the derived projecting and entry sets leave out. */
function inventoryGaps(projecting: readonly KindId[], entries: readonly KindId[]): KindId[] {
  const inventory = handEditableKinds();
  return [...inventory.all.filter(kind => !projecting.includes(kind)),
    ...inventory.entryLists.filter(kind => !entries.includes(kind))];
}

describe("projected kinds' parsers and entry grammars", () => {
  it("gives every projecting kind a parser, save the free-prose kinds", () => {
    expect(kindsMissingParsers(PRODUCTION_REGISTRATIONS)).toEqual([]);
    expect(RECORD_LINK_KINDS).toEqual(expect.arrayContaining([...PARSERLESS_KINDS]));
  });
  it("names a projecting kind registered without a parser", () => {
    expect(kindsMissingParsers(PRODUCTION_REGISTRATIONS.filter(item => item.kind !== COHORT_REGISTRATION.kind)))
      .toEqual(["cohort/document"]);
  });
  it("carries every entry kind's declared grammar on its mechanism", () => {
    expect(kindsMissingEntryGrammars(KIND_MECHANISMS)).toEqual([]);
    expect(entryKinds(KIND_MECHANISMS)).toContain("personal/errand-queue");
    expect(RECORD_LINK_KINDS).not.toContain("personal/errand-queue");
  });
  it("names an entry kind whose mechanism drops its grammar", () => {
    const inbound: KindMechanism = { ...KIND_MECHANISMS["work-item/inbound"] };
    delete inbound.entry;
    expect(kindsMissingEntryGrammars({ ...KIND_MECHANISMS, "work-item/inbound": inbound })).toEqual(["work-item/inbound"]);
  });
  it("covers every hand-editable projected kind in the derived sets", () => {
    const inventory = handEditableKinds();
    expect(inventory.all).not.toHaveLength(0);
    expect(inventory.entryLists).not.toHaveLength(0);
    expect(inventoryGaps(RECORD_LINK_KINDS, entryKinds(KIND_MECHANISMS))).toEqual([]);
  });
  it("names a hand-editable kind the derived sets leave out", () => {
    expect(inventoryGaps(RECORD_LINK_KINDS.filter(kind => kind !== "work-item/inbound"), entryKinds(KIND_MECHANISMS)))
      .toEqual(["work-item/inbound"]);
    expect(inventoryGaps(RECORD_LINK_KINDS, entryKinds(KIND_MECHANISMS).filter(kind => kind !== "personal/inbox")))
      .toEqual(["personal/inbox"]);
  });
});
