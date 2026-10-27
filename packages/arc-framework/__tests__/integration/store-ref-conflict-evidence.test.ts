/** Public reads and admission retain sibling conflict evidence independently of the subject version. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { ConflictRecordSchema, RecordReferenceSchema, type StoreRecord, type StoreResult, type WriteCheck } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");
const kinds = ["personal/document", "work-item/companion", "cohort/document", "project-inbox/inbox", "review/evidence", "lineage/transition"] as const;
const scenarios = [...kinds.map(kind => ({ kind, completed: false })),
  ...(["work-item/companion", "cohort/document"] as const).map(kind => ({ kind, completed: true }))];

async function subject(f: RefConformanceFixture, kind: typeof kinds[number]) {
  if (kind === "project-inbox/inbox") await seed(f, f.reference("project-registry/identity"));
  const primary = kind === "lineage/transition" ? await seed(f, f.reference("work-item/meta")) : undefined;
  const reference = primary ? RecordReferenceSchema.parse({ kind, owner: primary.reference.owner }) : f.reference(kind);
  return seed(f, reference);
}

/** A typed externally supplied conflict uses exact public subject values, as the whole-record producer does. */
async function addConflict(f: RefConformanceFixture, record: StoreRecord) {
  const reference = RecordReferenceSchema.parse({ owner: record.reference.owner, kind: `${record.reference.kind.split("/")[0]}/conflict-record`, key: "external-conflict" });
  const value = { reference: record.reference, content: record.content, version: record.version, formatVersion: record.formatVersion,
    ...(record.placement ? { placement: record.placement } : {}), ...(record.links ? { links: record.links } : {}) };
  const label = { actor: "external-writer", time: "2026-01-01T00:00:00.000Z" };
  const conflict = ConflictRecordSchema.parse({ record: record.reference, location: { kind: "record" }, base: value,
    current: { value, label }, incoming: { value: null, label } });
  success(await f.store.write({ action: "put", reference, expected: null, content: canonicalize(conflict), provenance: testProvenance }));
  return reference;
}

async function complete(f: RefConformanceFixture, record: StoreRecord) {
  const reference = record.reference.kind === "cohort/document" ? record.reference
    : RecordReferenceSchema.parse({ kind: "work-item/meta", owner: record.reference.owner });
  const primary = success(await f.store.read({ reference }));
  success(await f.store.write({ ...update(f, primary, primary.content), placement: { kind: "completed", quarter } }));
  return success(await f.store.read({ reference: record.reference }));
}

const scope = (f: RefConformanceFixture) => f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
const refs = async (f: RefConformanceFixture) => (await f.ports.exec("git", [...scope(f), "for-each-ref", "--format=%(refname) %(objectname)",
  "refs/arc/work/", "refs/arc/cohort/", "refs/arc/archive/", "refs/arc/history/", "refs/arc/project/", "refs/arc/user/"])).stdout;

describe.each(["default", "separate"] as const)("complete sibling conflict evidence in %s", layout => {
  for (const scenario of scenarios) it.each(["blob", "tree"] as const)(`refuses unavailable %s beside ${scenario.kind}, completed ${scenario.completed}, and retries after exact restoration`, async damage => {
    let armed = false;
    const checked: StoreResult<StoreRecord>[] = [];
    const controlKind = scenario.kind === "lineage/transition" ? "personal/document" : "project-registry/counter";
    const check: WriteCheck = async ({ before, after }) => {
      if (!armed || !evidence) return [];
      const results = [await before.read({ reference: evidence.reference }), await after.read({ reference: evidence.reference })];
      checked.push(...results);
      return results.some(result => result.status === "refused") ? [{ rule: "test.complete-conflict-evidence",
        condition: "The registered rule cannot establish sibling conflict evidence.", remedy: { text: "Restore the missing conflict objects, then retry." } }] : [];
    };
    const f = await createRefFixture({ [controlKind]: { check } }, layout);
    const created = await subject(f, scenario.kind), conflict = await addConflict(f, created);
    const evidence: StoreRecord = scenario.completed ? await complete(f, created) : success(await f.store.read({ reference: created.reference }));
    expect(evidence.conflicts).toEqual([conflict]);
    const control = await seed(f, f.reference(controlKind, "control"));
    const healthy = await seed(f, f.reference("cohort/document", "unrelated"));
    const home = expandStoredPath(evidence.reference, { placement: evidence.placement });
    const conflictHome = expandStoredPath(conflict, { placement: evidence.placement });
    const path = damage === "tree" ? `${home.root}conflicts` : conflictHome.path;
    const oid = (await f.ports.exec("git", [...scope(f), "rev-parse", `${home.ref}:${path}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...scope(f), "cat-file", damage, oid])).stdout;
    const asOf = await f.settle(), before = await refs(f);
    await removeLooseObject(f.root, oid, f.gitDir);
    const unavailable = { status: "refused", refusal: { condition: expect.stringMatching(/unavailable|missing|cannot.*establish/iu),
      remedy: { text: expect.stringMatching(/restore|fetch/iu) } } };
    for (const saved of [false, true]) {
      expect.soft(await f.store.read({ reference: evidence.reference, ...(saved ? { asOf } : {}) })).toMatchObject(unavailable);
      expect.soft(await f.store.read({ reference: healthy.reference, ...(saved ? { asOf } : {}) })).toMatchObject({ status: "ok" });
    }
    if (evidence.reference.owner.type === "work-item" || evidence.reference.owner.type === "cohort") {
      const named = RecordReferenceSchema.parse({ ...evidence.reference,
        owner: { type: evidence.reference.owner.type, name: evidence.reference.owner.name } });
      expect.soft(await f.store.read({ reference: named })).toMatchObject(unavailable);
    }
    const request = { writes: [mutationOf(update(f, control))], provenance: testProvenance,
      observations: [{ reference: evidence.reference, expected: { version: evidence.version, conflicts: evidence.conflicts } }] };
    expect.soft(await f.store.batch(request)).toMatchObject(unavailable);
    armed = true;
    expect.soft(await f.store.write(update(f, control))).toMatchObject({ status: "refused" });
    expect.soft(checked).toHaveLength(2);
    for (const result of checked) expect.soft(result).toMatchObject(unavailable);
    expect.soft(await refs(f)).toBe(before);
    await f.ports.rawExec([...scope(f), "hash-object", "-w", "-t", damage, "--stdin"], { input: bytes });
    for (const saved of [false, true]) expect(success(await f.store.read({ reference: evidence.reference, ...(saved ? { asOf } : {}) })))
      .toMatchObject({ version: evidence.version, conflicts: [conflict] });
    checked.length = 0;
    success(await f.store.batch(request));
    expect(checked).toHaveLength(2);
    for (const result of checked) expect(result).toMatchObject({ status: "ok", result: { conflicts: [conflict] } });
  }, 90_000);

  it.each(kinds)("keeps genuine absent conflicts empty for %s in current, saved, checks and observations", async kind => {
    let armed = false;
    const checked: StoreResult<StoreRecord>[] = [];
    const controlKind = kind === "lineage/transition" ? "personal/document" : "project-registry/counter";
    const f = await createRefFixture({ [controlKind]: { check: async ({ before, after }: Parameters<WriteCheck>[0]) => {
      if (armed && evidence) checked.push(await before.read({ reference: evidence.reference }), await after.read({ reference: evidence.reference }));
      return [];
    } } }, layout);
    const evidence: StoreRecord = await subject(f, kind);
    const control = await seed(f, f.reference(controlKind, "control")), asOf = await f.settle();
    for (const saved of [false, true]) expect(success(await f.store.read({ reference: evidence.reference, ...(saved ? { asOf } : {}) })).conflicts).toEqual([]);
    armed = true;
    success(await f.store.batch({ writes: [mutationOf(update(f, control))], provenance: testProvenance,
      observations: [{ reference: evidence.reference, expected: { version: evidence.version, conflicts: [] } }] }));
    expect(checked).toHaveLength(2);
    for (const result of checked) expect(result).toMatchObject({ status: "ok", result: { conflicts: [] } });
  }, 60_000);

  it("keeps a known work-item subject readable beside an unavailable review conflict subtree", async () => {
    const f = await createRefFixture({}, layout), healthy = await seed(f, f.reference("work-item/companion"));
    const review = await seed(f, RecordReferenceSchema.parse({ owner: healthy.reference.owner, kind: "review/evidence", key: "nested-review" }));
    await addConflict(f, review);
    const home = expandStoredPath(review.reference), directory = `${home.root}conflicts`;
    const oid = (await f.ports.exec("git", [...scope(f), "rev-parse", `${home.ref}:${directory}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...scope(f), "cat-file", "tree", oid])).stdout;
    const asOf = await f.settle(), control = await seed(f, f.reference("personal/document", "control"));
    await removeLooseObject(f.root, oid, f.gitDir);
    for (const saved of [false, true]) expect.soft(await f.store.read({ reference: healthy.reference, ...(saved ? { asOf } : {}) }))
      .toMatchObject({ status: "ok", result: { conflicts: [] } });
    expect.soft(await f.store.batch({ writes: [mutationOf(update(f, control))], provenance: testProvenance,
      observations: [{ reference: healthy.reference, expected: { version: healthy.version, conflicts: [] } }] })).toMatchObject({ status: "ok" });
    await f.ports.rawExec([...scope(f), "hash-object", "-w", "-t", "tree", "--stdin"], { input: bytes });
    expect(success(await f.store.read({ reference: review.reference })).conflicts).toHaveLength(1);
  }, 60_000);

  it("keeps personal identity authoritative during scoped recovery beside an unavailable unrelated tree", async () => {
    const f = await createRefFixture({}, layout), evidence = await subject(f, "personal/document");
    const home = expandStoredPath(evidence.reference), entries = await capturedEntries(f, home.ref);
    const parent = (await f.ports.exec("git", [...scope(f), "rev-parse", home.ref])).stdout.trim();
    const metadata = JSON.parse((await f.ports.exec("git", [...scope(f), "show", `${parent}:${home.metadataPath}`])).stdout) as object;
    await plantRef(f.root, home.ref, [...entries.filter(entry => entry.path !== home.metadataPath),
      { path: home.metadataPath, content: canonicalize({ ...metadata, slug: "unrelated-slug" }) },
      { path: `${home.root}unrelated/evidence.txt`, content: "independent tree\n" }], { parents: [parent], gitDir: f.gitDir });
    const query = `${home.ref}:${home.root}unrelated`;
    const oid = (await f.ports.exec("git", [...scope(f), "rev-parse", query])).stdout.trim();
    const bytes = (await f.ports.rawExec([...scope(f), "cat-file", "tree", oid])).stdout, asOf = await f.settle();
    await removeLooseObject(f.root, oid, f.gitDir);
    for (const saved of [false, true]) expect.soft(await f.store.read({ reference: evidence.reference, ...(saved ? { asOf } : {}) }))
      .toMatchObject({ status: "ok", result: { reference: evidence.reference, conflicts: [] } });
    await f.ports.rawExec([...scope(f), "hash-object", "-w", "-t", "tree", "--stdin"], { input: bytes });
    expect(success(await f.store.read({ reference: evidence.reference, asOf })).conflicts).toEqual([]);
  }, 60_000);

  it.each(scenarios)("retains establishable newer-format conflicts for $kind, completed $completed, through observation and registered checks", async scenario => {
    let armed = false;
    const checked: StoreResult<StoreRecord>[] = [];
    const controlKind = scenario.kind === "lineage/transition" ? "personal/document" : "project-registry/counter";
    const f = await createRefFixture({ [controlKind]: { check: async ({ before, after }: Parameters<WriteCheck>[0]) => {
      if (!armed || !evidence) return [];
      const results = [await before.read({ reference: evidence.reference }), await after.read({ reference: evidence.reference })];
      checked.push(...results);
      return results.every(result => result.status === "ok" && result.result.conflicts.length === 1) ? [] : [{ rule: "test.newer-conflict-evidence",
        condition: "The registered rule lost an establishable conflict.", remedy: { text: "Retain the sibling conflict reference." } }];
    } } }, layout);
    const created = await subject(f, scenario.kind), conflict = await addConflict(f, created);
    const evidence: StoreRecord = scenario.completed ? await complete(f, created) : success(await f.store.read({ reference: created.reference }));
    const control = await seed(f, f.reference(controlKind, "control"));
    const home = expandStoredPath(conflict, { placement: evidence.placement }), entries = await capturedEntries(f, home.ref);
    const parent = (await f.ports.exec("git", [...scope(f), "rev-parse", home.ref])).stdout.trim();
    const metadata = JSON.parse((await f.ports.exec("git", [...scope(f), "show", `${parent}:${home.metadataPath}`])).stdout) as { formats: Record<string, number> };
    metadata.formats[canonicalize({ kind: conflict.kind, key: conflict.key })] = 2;
    const broken = await plantRef(f.root, home.ref, entries.map(entry => entry.path === home.metadataPath
      ? { path: entry.path, content: canonicalize(metadata) } : entry), { parents: [parent], gitDir: f.gitDir });
    const asOf = await f.settle(), before = await refs(f);
    for (const saved of [false, true]) {
      expect.soft(await f.store.read({ reference: evidence.reference, ...(saved ? { asOf } : {}) })).toMatchObject({ status: "ok", result: {
        version: evidence.version, conflicts: [conflict] } });
      expect.soft(await f.store.read({ reference: conflict, ...(saved ? { asOf } : {}) })).toMatchObject({ status: "refused", refusal: {
        code: "record-malformed", condition: expect.stringMatching(/format version|newer/iu) } });
    }
    const request = { writes: [mutationOf(update(f, control))], provenance: testProvenance,
      observations: [{ reference: evidence.reference, expected: { version: evidence.version, conflicts: [] } }] };
    expect.soft(await f.store.batch(request)).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    expect.soft(await refs(f)).toBe(before);
    armed = true;
    const freshControl = success(await f.store.read({ reference: control.reference }));
    success(await f.store.batch({ ...request, writes: [mutationOf(update(f, freshControl))], observations: [{ reference: evidence.reference,
      expected: { version: evidence.version, conflicts: [conflict] } }] }));
    expect(checked).toHaveLength(2);
    for (const result of checked) expect(result).toMatchObject({ status: "ok", result: { conflicts: [conflict] } });
    await plantRef(f.root, home.ref, entries, { parents: [broken.tip], gitDir: f.gitDir });
    expect(success(await f.store.read({ reference: conflict })).formatVersion).toBe(1);
    expect(success(await f.store.read({ reference: evidence.reference })).conflicts).toEqual([conflict]);
  }, 90_000);

  it.each(["newer-format", "unavailable-blob"] as const)("preserves %s sibling evidence in advisory sync before/after checks", async fault => {
    let armed = false;
    const checked: StoreResult<StoreRecord>[] = [];
    const f = await createRefFixture({ "cohort/document": { check: async ({ before, after, writer }) => {
      if (!armed || !evidence || writer.kind !== "verb" || writer.verb !== "sync") return [];
      const results = [await before.read({ reference: evidence.reference }), await after.read({ reference: evidence.reference })];
      checked.push(...results);
      return results.every(result => result.status === "ok" && result.result.conflicts.length === 1) ? [] : [{
        rule: "test.sync-conflict-evidence", condition: "The sync rule cannot certify the conflict evidence.",
        remedy: { text: "Restore the sibling conflict evidence and retry." },
      }];
    } } }, layout);
    const created = await subject(f, "work-item/companion"), conflict = await addConflict(f, created);
    const evidence: StoreRecord = success(await f.store.read({ reference: created.reference }));
    const control = await seed(f, f.reference("cohort/document", "sync-control"), "one\ntwo\nthree\nfour\nfive\n");
    const peer = f.remote(true);
    if (!peer) throw new Error("Expected independent peer");
    success(await f.store.push()); success(await peer.pull());
    success(await f.store.write(update(f, control, "ONE\ntwo\nthree\nfour\nfive\n")));
    success(await peer.write(update(f, control, "one\ntwo\nthree\nfour\nFIVE\n")));
    const home = expandStoredPath(conflict), entries = await capturedEntries(f, home.ref);
    const parent = (await f.ports.exec("git", [...scope(f), "rev-parse", home.ref])).stdout.trim();
    const oid = (await f.ports.exec("git", [...scope(f), "rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...scope(f), "cat-file", "blob", oid])).stdout;
    if (fault === "newer-format") {
      const metadata = JSON.parse((await f.ports.exec("git", [...scope(f), "show", `${parent}:${home.metadataPath}`])).stdout) as { formats: Record<string, number> };
      metadata.formats[canonicalize({ kind: conflict.kind, key: conflict.key })] = 2;
      await plantRef(f.root, home.ref, entries.map(entry => entry.path === home.metadataPath
        ? { path: entry.path, content: canonicalize(metadata) } : entry), { parents: [parent], gitDir: f.gitDir });
    } else await removeLooseObject(f.root, oid, f.gitDir);
    armed = true;
    const pulled = success(await f.store.pull());
    expect(checked).toHaveLength(2);
    for (const result of checked) expect(result).toMatchObject(fault === "newer-format"
      ? { status: "ok", result: { conflicts: [conflict] } }
      : { status: "refused", refusal: { code: "state-unresolvable", remedy: { text: expect.stringMatching(/restore|fetch/iu) } } });
    const notices = pulled.pulls.flatMap(outcome => outcome.notices).filter(notice => notice.kind === "rule-broken");
    expect(notices).toEqual(fault === "newer-format" ? [] : [expect.objectContaining({ rule: "test.sync-conflict-evidence" })]);
    if (fault === "unavailable-blob") await f.ports.rawExec([...scope(f), "hash-object", "-w", "--stdin"], { input: bytes });
    expect(success(await f.store.read({ reference: evidence.reference })).conflicts).toEqual([conflict]);
  }, 90_000);

  it.each(["personal/document", "review/evidence"] as const)("refuses a newer-format sibling whose target cannot be established beside %s, then admits forward repair", async kind => {
    const f = await createRefFixture({}, layout), created = await subject(f, kind), conflict = await addConflict(f, created);
    const evidence = success(await f.store.read({ reference: created.reference }));
    const control = await seed(f, f.reference("project-registry/counter", "control"));
    const home = expandStoredPath(conflict), entries = await capturedEntries(f, home.ref);
    const parent = (await f.ports.exec("git", [...scope(f), "rev-parse", home.ref])).stdout.trim();
    const metadata = JSON.parse((await f.ports.exec("git", [...scope(f), "show", `${parent}:${home.metadataPath}`])).stdout) as { formats: Record<string, number> };
    metadata.formats[canonicalize({ kind: conflict.kind, key: conflict.key })] = 2;
    const broken = await plantRef(f.root, home.ref, entries.map(entry => entry.path === home.metadataPath
      ? { path: entry.path, content: canonicalize(metadata) } : entry.path === home.path
        ? { path: entry.path, content: '{"newerConflictPayload":true}' } : entry), { parents: [parent], gitDir: f.gitDir });
    const asOf = await f.settle(), before = await refs(f);
    const refused = { status: "refused", refusal: { code: "record-malformed",
      condition: expect.stringMatching(/conflict.*cannot.*establish|newer|format/iu), remedy: { text: expect.stringMatching(/repair|restore|rebuild|saved/iu) } } };
    for (const saved of [false, true]) expect.soft(await f.store.read({ reference: evidence.reference, ...(saved ? { asOf } : {}) })).toMatchObject(refused);
    const request = { writes: [mutationOf(update(f, control))], provenance: testProvenance,
      observations: [{ reference: evidence.reference, expected: { version: evidence.version, conflicts: [] } }] };
    expect.soft(await f.store.batch(request)).toMatchObject(refused);
    expect.soft(await refs(f)).toBe(before);
    await plantRef(f.root, home.ref, entries, { parents: [broken.tip], gitDir: f.gitDir });
    const fresh = success(await f.store.read({ reference: control.reference }));
    success(await f.store.batch({ ...request, writes: [mutationOf(update(f, fresh))], observations: [{ reference: evidence.reference,
      expected: { version: evidence.version, conflicts: [conflict] } }] }));
    expect(success(await f.store.read({ reference: evidence.reference })).conflicts).toEqual([conflict]);
  }, 60_000);
});
