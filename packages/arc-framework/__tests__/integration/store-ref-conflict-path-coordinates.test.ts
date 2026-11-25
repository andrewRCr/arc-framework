/** Completed-folder projections retain exact conflict-slot evidence across captured views. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { ConflictRecordSchema, RecordReferenceSchema, type StoreRecord, type StoreResult, type WriteCheck } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");
const scope = (f: RefConformanceFixture) => f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
const refs = async (f: RefConformanceFixture) => (await f.ports.exec("git", [...scope(f), "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;

async function addConflict(f: RefConformanceFixture, record: StoreRecord) {
  const reference = RecordReferenceSchema.parse({ owner: record.reference.owner,
    kind: `${record.reference.kind.split("/")[0]}/conflict-record`, key: "external-conflict" });
  const value = { reference: record.reference, content: record.content, version: record.version, formatVersion: record.formatVersion,
    ...(record.placement ? { placement: record.placement } : {}) };
  const label = { actor: "external-writer", time: "2026-01-01T00:00:00.000Z" };
  const content = canonicalize(ConflictRecordSchema.parse({ record: record.reference, location: { kind: "record" }, base: value,
    current: { value, label }, incoming: { value: null, label } }));
  success(await f.store.write({ action: "put", reference, expected: null, content, provenance: testProvenance }));
  return reference;
}

/** Structural damage requires a new source state; a saved damaged state remains immutable evidence. */
const structurallyUnavailable = (saved = false) => ({ status: "refused", refusal: { code: "state-unresolvable",
  condition: expect.stringMatching(/unavailable|cannot.*establish/iu), remedy: { text: expect.stringMatching(saved
    ? /retain.*immutable.*evidence.*repair.*source forward.*valid conflict structure.*select a readable saved state/iu
    : /repair.*source forward.*valid conflict structure.*retry/iu) } } });

describe.each(["default", "separate"] as const)("completed conflict path coordinates in %s", layout => {
  it.each(["work-item/companion", "cohort/document"] as const)("retains malformed descendants for %s through reads and atomic admission", async kind => {
    let armed = false;
    const checked: StoreResult<StoreRecord>[] = [];
    const check: WriteCheck = async ({ before, after }) => {
      if (!armed) return [];
      const results = [await before.read({ reference: evidence.reference }), await after.read({ reference: evidence.reference })];
      checked.push(...results);
      return results.some(result => result.status === "refused") ? [{ rule: "test.conflict-path-evidence",
        condition: "The conflict slot cannot be established.", remedy: { text: "Repair the slot forward, then retry." } }] : [];
    };
    const f = await createRefFixture({ "project-registry/counter": { check } }, layout);
    const created = await seed(f, f.reference(kind)), conflict = await addConflict(f, created);
    const primaryReference = kind === "cohort/document" ? created.reference
      : RecordReferenceSchema.parse({ owner: created.reference.owner, kind: "work-item/meta" });
    const primary = success(await f.store.read({ reference: primaryReference }));
    success(await f.store.write({ ...update(f, primary, primary.content), placement: { kind: "completed", quarter } }));
    const evidence = success(await f.store.read({ reference: created.reference }));
    const control = await seed(f, f.reference("project-registry/counter", "control"));
    const home = expandStoredPath(evidence.reference, { placement: evidence.placement });
    const conflictHome = expandStoredPath(conflict, { placement: evidence.placement });
    const original = await capturedEntries(f, home.ref), directory = `${home.root}conflicts`;
    const kept = original.filter(entry => !entry.path.startsWith(`${directory}/`));
    const blob = new TextDecoder().decode((await f.ports.rawExec([...scope(f), "hash-object", "-w", "--stdin"],
      { input: Buffer.from("Conflict descendant.\n") })).stdout).trim();
    const tree = async (name: Uint8Array, mode = "100644", oid = blob) => new TextDecoder().decode((await f.ports.rawExec(
      [...scope(f), "hash-object", "-w", "-t", "tree", "--stdin"], { input: Buffer.concat([
        Buffer.from(`${mode} `), name, Buffer.from([0]), Buffer.from(oid, "hex"),
      ]) })).stdout).trim();
    const parent = (await f.ports.exec("git", [...scope(f), "rev-parse", home.ref])).stdout.trim();
    const child = await tree(Buffer.from("nested"));
    const invalidDirect = await tree(Buffer.concat([Buffer.from("external-"), Buffer.from([255]), Buffer.from(".json")]), "40000", child);
    const ignored = await plantRef(f.root, home.ref, [...kept, { path: directory, mode: "040000", oid: invalidDirect }],
      { parents: [parent], gitDir: f.gitDir });
    const ignoredState = await f.settle();
    for (const saved of [false, true]) expect(success(await f.store.read({ reference: evidence.reference,
      ...(saved ? { asOf: ignoredState } : {}) }))).toMatchObject({ version: evidence.version, conflicts: [] });
    const invalidChild = await tree(Buffer.concat([Buffer.from("nested-"), Buffer.from([255])]));
    const damaged = await plantRef(f.root, home.ref, [...kept, { path: conflictHome.path, mode: "040000", oid: invalidChild }],
      { parents: [ignored.tip], gitDir: f.gitDir });
    const damagedState = await f.settle(), before = await refs(f);
    for (const saved of [false, true]) expect.soft(await f.store.read({ reference: evidence.reference,
      ...(saved ? { asOf: damagedState } : {}) })).toMatchObject(structurallyUnavailable(saved));
    const request = { writes: [mutationOf(update(f, control))], provenance: testProvenance,
      observations: [{ reference: evidence.reference, expected: { version: evidence.version, conflicts: [] } }] };
    expect.soft(await f.store.batch(request)).toMatchObject(structurallyUnavailable());
    armed = true;
    const checkedControl = success(await f.store.read({ reference: control.reference }));
    expect.soft(await f.store.write(update(f, checkedControl))).toMatchObject({ status: "refused" });
    expect.soft(checked).toHaveLength(2);
    for (const result of checked) expect.soft(result).toMatchObject(structurallyUnavailable());
    expect.soft(await refs(f)).toBe(before);
    await plantRef(f.root, home.ref, original, { parents: [damaged.tip], gitDir: f.gitDir, message: "Repair conflict slot forward" });
    const repaired = await f.settle();
    for (const saved of [false, true]) expect(success(await f.store.read({ reference: evidence.reference,
      ...(saved ? { asOf: repaired } : {}) }))).toMatchObject({ version: evidence.version, conflicts: [conflict] });
    expect(await f.store.read({ reference: evidence.reference, asOf: damagedState })).toMatchObject(structurallyUnavailable(true));
    expect(success(await f.store.read({ reference: evidence.reference, asOf: ignoredState })).conflicts).toEqual([]);
    checked.length = 0;
    success(await f.store.batch({ ...request, observations: [{ reference: evidence.reference,
      expected: { version: evidence.version, conflicts: [conflict] } }] }));
    expect(checked).toHaveLength(2);
    for (const result of checked) expect(result).toMatchObject({ status: "ok", result: { conflicts: [conflict] } });
  }, 90_000);
});
