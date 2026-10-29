/** Presence and externally malformed entry documents at the withdrawal boundary. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createKindRegistry, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";
import { ConflictRecordSchema, type WholeRecordConflict } from "../../src/lib/store/conflict.js";
import { ENTRY_CONFIGS, type EntryKind } from "../../src/lib/store/kinds/entry-configs.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const ownQuarter = ArchiveQuarterSchema.parse("2027-q1"), remoteQuarter = ArchiveQuarterSchema.parse("2026-q4");
const provenance = { verb: "archive", lifecycleAction: "archive" };
const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);

async function start(h: RefSyncFixture, name: string) {
  return success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name }, kind: "work-item/meta" }),
    content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
}

function document(kind: EntryKind, text: string, id: string | null = "11111111"): string {
  const grammar = ENTRY_CONFIGS[kind], section = grammar.sections[0];
  const header = grammar.shape === "field-header" ? "**Concern:**\n_Remove when:_ `resolved`" : "### **Concern**";
  return `# Entries\n\n## ${section}\n\n${header}\n\n${id === null ? "" : `- _Id:_ \`${id}\`\n\n`}${text}\n`;
}

/** Modify an actual stored tree without discarding the producer's other paths or batch receipt. */
async function externalDocument(side: RefSyncFixture["a"], reference: RecordReference, content: string, replaceBatch = false) {
  const home = expandStoredPath(reference, { registry });
  const tip = (await side.git(["rev-parse", home.ref])).stdout.trim();
  const rows = (await side.git(["ls-tree", "-r", "-z", home.ref])).stdout.split("\0").filter(Boolean);
  const entries: PlantTreeEntry[] = rows.map(row => {
    const [header = "", path = ""] = row.split("\t"), [mode, , oid = ""] = header.split(" ");
    if (mode !== "100644" && mode !== "100755" && mode !== "120000" && mode !== "160000") throw new Error(`Unexpected fixture mode ${mode}`);
    return path === home.path ? { path, content } : { path, oid, mode };
  });
  const parents = replaceBatch ? (await side.git(["show", "-s", "--format=%P", tip])).stdout.trim().split(" ").filter(Boolean) : [tip];
  const message = replaceBatch ? (await side.git(["show", "-s", "--format=%B", tip])).stdout
    : `External capture\n\nArc-Actor: ${side.carry().actor}\n`;
  return plantRef(side.root, home.ref, entries, { parents, message, gitDir: side.gitDir });
}

describe.each(["default", "separate"] as const)("withdrawal entry boundaries in %s", layout => {
  for (const scope of ["project", "personal"] as const) {
    it.each([
      { presence: "absent", emptyWrite: false }, { presence: "absent", emptyWrite: true }, { presence: "present empty", emptyWrite: false },
    ] as const)(`restores an originally $presence ${scope} inbox (empty end write: $emptyWrite) and its expected-version basis`, async ({ presence, emptyWrite }) => {
      const h = await refSyncFixture(layout), made = await start(h, "entry-presence");
      const reference = RecordReferenceSchema.parse({ owner: scope === "project" ? { type: "project", name: "project" } : { type: "person", name: "andrew" },
        kind: scope === "project" ? "project-inbox/inbox" : "personal/inbox" });
      const neighbor = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "kept" });
      if (scope === "personal") success(await h.a.store.write({ action: "put", reference: neighbor, expected: null, content: "Keep me.\n", provenance }));
      if (presence === "present empty") success(await h.a.store.write({ action: "put", reference, expected: null, content: "", provenance }));
      success(await h.a.store.push()); success(await h.b.store.pull());
      const primary = success(await h.a.store.read({ reference: made.reference }));
      const prior = presence === "present empty" ? success(await h.a.store.read({ reference })).version : null;
      success(await h.a.store.batch({ writes: [
        { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
        { action: "put", reference, expected: prior, content: emptyWrite ? "" : document(reference.kind as EntryKind, "End contribution.") },
      ], provenance }));
      const remote = success(await h.b.store.read({ reference: made.reference }));
      success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
        placement: { kind: "completed", quarter: remoteQuarter }, provenance }));
      success(await h.b.store.push());
      expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      expect(success(await h.a.store.read({ reference: made.reference })).placement).toMatchObject({ kind: "completed", quarter: remoteQuarter });
      if (presence === "absent") {
        expect(await h.a.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
        success(await h.a.store.write({ action: "put", reference, expected: null, content: "", provenance }));
      } else {
        expect(success(await h.a.store.read({ reference })).content).toBe("");
        expect(await h.a.store.write({ action: "put", reference, expected: null, content: "", provenance }))
          .toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
      }
      if (scope === "personal") expect(success(await h.a.store.read({ reference: neighbor })).content).toBe("Keep me.\n");
      expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
      success(await h.b.store.pull());
      expect(success(await h.b.store.read({ reference })).content).toBe("");
    });

    it.each(["published empty", "later empty", "later entry"] as const)(`retains an independent %s ${scope} document and preserves absence in a whole-record clash`, async independent => {
      const h = await refSyncFixture(layout), made = await start(h, "entry-created-clash");
      const kind = scope === "project" ? "project-inbox/inbox" : "personal/inbox";
      const reference = RecordReferenceSchema.parse({ kind, owner: scope === "project" ? { type: "project", name: "project" } : { type: "person", name: "andrew" } });
      success(await h.a.store.push()); success(await h.b.store.pull());
      const primary = success(await h.a.store.read({ reference: made.reference })), after = document(kind, "End contribution.");
      success(await h.a.store.batch({ writes: [
        { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
        { action: "put", reference, expected: null, content: after },
      ], provenance }));
      const held = independent === "later entry" ? after + "\n" + document(kind, "Independent.", "22222222").split("\n\n").slice(2).join("\n\n") : "";
      if (independent !== "published empty") {
        const record = success(await h.a.store.read({ reference }));
        success(await h.a.store.write({ action: "put", reference, expected: record.version, content: held, provenance: { verb: "save", lifecycleAction: "capture" } }));
      }
      const remote = success(await h.b.store.read({ reference: made.reference }));
      success(await h.b.store.batch({ writes: [
        { action: "put", reference: remote.reference, expected: remote.version, content: remote.content, placement: { kind: "completed", quarter: remoteQuarter } },
        ...independent === "published empty" ? [{ action: "put" as const, reference, expected: null, content: "" }] : [],
      ], provenance }));
      success(await h.b.store.push());
      expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      const record = success(await h.a.store.read({ reference }));
      expect(record.content).toBe(held);
      if (independent !== "published empty") {
        const conflicts = await Promise.all(record.conflicts.map(async reference => ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference })).content))));
        expect(conflicts).toContainEqual(expect.objectContaining({ location: { kind: "record" }, base: expect.objectContaining({ content: after }),
          current: expect.objectContaining({ value: expect.objectContaining({ content: held }) }), incoming: expect.objectContaining({ value: null }) }));
        success(await h.a.store.write({ action: "put", reference, expected: record.version, content: held, resolves: record.conflicts,
          provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
      }
      expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
      success(await h.b.store.pull());
      expect(success(await h.b.store.read({ reference })).content).toBe(held);
    });
  }

  const malformedCases = (["ancestor", "before", "after", "published", "current"] as const).flatMap((side, index) =>
    (["missing", "duplicate"] as const).map((problem, variant) => ({ side, problem,
      kind: (Object.keys(ENTRY_CONFIGS) as EntryKind[])[(index * 2 + variant) % 6] as EntryKind })));
  it.each(malformedCases)("preserves complete alternatives for $problem IDs in $side ($kind), then accepts visible repair", async ({ side, problem, kind }) => {
    const h = await refSyncFixture(layout), made = await start(h, "entry-invalid"), auxiliary = await start(h, "entry-auxiliary");
    const reference = RecordReferenceSchema.parse({ kind, owner: kind.startsWith("personal/") ? { type: "person", name: "andrew" }
      : kind.startsWith("project-") ? { type: "project", name: "project" } : auxiliary.reference.owner });
    const common = document(kind, "Common."), before = document(kind, "Before end."), after = document(kind, "End contribution.");
    const published = document(kind, "Published."), later = document(kind, "Surrounding local.");
    const malformed = problem === "missing" ? document(kind, "Malformed.", null)
      : document(kind, "Malformed.") + "\n" + document(kind, "Duplicate.").split("\n\n").slice(2).join("\n\n");
    success(await h.a.store.write({ action: "put", reference, expected: null, content: common, provenance }));
    if (side === "ancestor") await externalDocument(h.a, reference, malformed);
    const commonValue = success(await h.a.store.read({ reference }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    let local = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: local.version, content: before, provenance }));
    if (side === "before") await externalDocument(h.a, reference, malformed);
    local = success(await h.a.store.read({ reference }));
    const beforeValue = local;
    const primary = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
      { action: "put", reference, expected: local.version, content: after },
    ], provenance }));
    if (side === "after") await externalDocument(h.a, reference, malformed, true);
    const afterValue = success(await h.a.store.read({ reference }));
    if (side === "current") await externalDocument(h.a, reference, malformed);
    else if (side === "after") {
      const current = success(await h.a.store.read({ reference }));
      success(await h.a.store.write({ action: "put", reference, expected: current.version, content: later, provenance: { verb: "save", lifecycleAction: "capture" } }));
    }
    const currentValue = success(await h.a.store.read({ reference }));
    const remote = success(await h.b.store.read({ reference: made.reference })), remoteEntry = success(await h.b.store.read({ reference }));
    success(await h.b.store.batch({ writes: [
      { action: "put", reference: remote.reference, expected: remote.version, content: remote.content, placement: { kind: "completed", quarter: remoteQuarter } },
      { action: "put", reference, expected: remoteEntry.version, content: side === "current" ? common : published },
    ], provenance }));
    if (side === "published") await externalDocument(h.b, reference, malformed, true);
    const neighbor = success(await h.b.store.read({ reference: auxiliary.reference }));
    success(await h.b.store.write({ action: "put", reference: neighbor.reference, expected: neighbor.version,
      content: neighbor.content, placement: { kind: "backlog", commitment: "planned" },
      provenance: { verb: "backlog", lifecycleAction: "backlog" } }));
    const publishedValue = success(await h.b.store.read({ reference }));
    success(await h.b.store.push());
    const notices = success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(success(await h.a.store.read({ reference: made.reference })).placement).toMatchObject({ kind: "completed", quarter: remoteQuarter });
    expect(success(await h.a.store.read({ reference: auxiliary.reference })).placement).toMatchObject({ kind: "backlog", commitment: "planned" });
    const selected = success(await h.a.store.read({ reference }));
    expect(selected.content).toBe(side === "published" || side === "current" ? malformed : published);
    const conflicts = await Promise.all(selected.conflicts.map(async reference =>
      ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference })).content))));
    const whole = conflicts.filter((clash): clash is WholeRecordConflict => clash.location.kind === "record");
    expect(whole.length).toBeGreaterThan(0);
    const value = ({ reference, content, version, formatVersion, placement }: typeof selected) =>
      ({ reference, content, version, formatVersion, ...placement ? { placement } : {} });
    const expected = side === "after" || side === "current"
      ? { base: value(afterValue), current: { value: value(side === "current" || kind.startsWith("work-item/") ? currentValue : publishedValue) }, incoming: { value: value(beforeValue) } }
      : { base: value(commonValue), current: { value: value(beforeValue) }, incoming: { value: value(publishedValue) } };
    expect(whole).toContainEqual(expect.objectContaining({ location: { kind: "record" },
      base: expect.objectContaining(expected.base), current: expect.objectContaining({ value: expect.objectContaining(expected.current.value),
        label: expect.objectContaining({ actor: side === "after" && !kind.startsWith("work-item/") ? h.b.carry().actor : h.a.carry().actor }) }),
      incoming: expect.objectContaining({ value: expect.objectContaining(expected.incoming.value),
        label: expect.objectContaining({ actor: side === "after" || side === "current" ? h.a.carry().actor : h.b.carry().actor }) }) }));
    expect(whole.some(clash => JSON.stringify(clash).includes("Malformed."))).toBe(true);
    for (const clash of whole) {
      if (!("value" in clash.current)) throw new Error("Expected a whole-record conflict");
      expect(clash.current.label.actor).toMatch(/^andrew@/u);
      expect(clash.incoming.label.actor).toMatch(/^andrew@/u);
      for (const value of [clash.base, clash.current.value, clash.incoming.value]) if (value !== null && typeof value !== "string") {
        expect(value.version).toMatch(/^sha256:[0-9a-f]{64}$/u);
        expect(value.formatVersion).toBe(1);
        expect(value.reference).toMatchObject(reference);
        if (kind.startsWith("work-item/")) expect(value.placement).toBeDefined();
      }
    }
    success(await h.a.store.write({ action: "put", reference, expected: selected.version, content: document(kind, "Repaired.", "33333333"),
      resolves: selected.conflicts, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
    expect(success(await h.a.store.read({ reference })).conflicts).toEqual([]);
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe(document(kind, "Repaired.", "33333333"));
  });
});
