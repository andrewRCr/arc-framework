/** An unpublished end's inverse includes existing sibling contributions while retaining new children. */
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";

const provenance = { verb: "archive", lifecycleAction: "archive" };
const own = ArchiveQuarterSchema.parse("2027-q1"), remote = ArchiveQuarterSchema.parse("2026-q4");

it.each(["default", "separate"] as const)("restores an earlier unpublished retired sibling to live state in %s", async layout => {
  const h = await refSyncFixture(layout);
  const make = async (name: string) => {
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
      content: makeMetaFixture(name), placement: { kind: "active" }, provenance }));
    return success(await h.a.store.read({ reference: made.reference }));
  };
  const a = await make("ending-owner");
  success(await h.a.store.push()); success(await h.b.store.pull());
  const b = await make("existing-local-sibling");
  const companion = RecordReferenceSchema.parse({ owner: b.reference.owner, kind: "work-item/companion", key: "extra" });
  success(await h.a.store.write({ action: "put", expected: null, reference: companion, content: "Earlier sibling records.\n", provenance }));
  const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: b.reference.owner });
  success(await h.a.store.batch({ writes: [
    { action: "put", reference: a.reference, expected: a.version, content: a.content, placement: { kind: "completed", quarter: own } },
    { action: "put", reference: lineage, expected: null, content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
      origin: { name: b.reference.owner.name, uid: "uid" in b.reference.owner ? b.reference.owner.uid : undefined },
      kind: "abandon", successors: [], incoming: [] })) },
    { action: "remove", reference: b.reference, expected: b.version },
  ], provenance }));
  const incoming = success(await h.b.store.read({ reference: a.reference }));
  success(await h.b.store.write({ action: "put", reference: incoming.reference, expected: incoming.version, content: incoming.content,
    placement: { kind: "completed", quarter: remote }, provenance }));
  success(await h.b.store.push());
  expect(success(await h.a.store.pull()).pulls.flatMap(row => row.notices))
    .toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: a.reference.owner }));
  expect(success(await h.a.store.read({ reference: a.reference })).placement).toMatchObject({ kind: "completed", quarter: remote });
  for (const side of [h.a, h.b]) {
    if (side === h.b) { success(await h.a.store.push()); success(await h.b.store.pull()); }
    expect(success(await side.store.read({ reference: b.reference }))).toMatchObject({ content: b.content, placement: { kind: "active" } });
    expect(success(await side.store.read({ reference: companion })).content).toBe("Earlier sibling records.\n");
    expect(await side.store.read({ reference: lineage })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const listed = success(await side.store.list({ family: "work-item", owner: b.reference.owner }));
    expect(listed).toMatchObject({ status: "complete", records: expect.arrayContaining([expect.objectContaining({ reference: b.reference })]) });
    const uid = "uid" in b.reference.owner ? b.reference.owner.uid : "";
    expect((await side.git(["for-each-ref", "--format=%(refname)", `refs/arc/work/${uid}`])).stdout.trim()).toBe(`refs/arc/work/${uid}`);
    expect((await side.git(["for-each-ref", "--format=%(refname)", `refs/arc/history/work/${uid}`])).stdout).toBe("");
  }
  success(await h.a.store.pull()); success(await h.a.store.push());
  expect(success(await h.a.store.read({ reference: b.reference })).content).toBe(b.content);
}, 20_000);

it.each((["default", "separate"] as const).flatMap(layout => (["archive", "retirement"] as const).map(end => ({ layout, end }))))(
  "preserves an independently published sibling $end during withdrawal in $layout", async ({ layout, end }) => {
    const h = await refSyncFixture(layout);
    const make = async (name: string) => {
      const made = success(await h.a.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
        content: makeMetaFixture(name), placement: { kind: "active" }, provenance }));
      return success(await h.a.store.read({ reference: made.reference }));
    };
    const a = await make("ending-owner"), b = await make("published-sibling");
    success(await h.a.store.push()); success(await h.b.store.pull());
    const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: b.reference.owner });
    const retirement = [{ action: "put" as const, expected: null, reference: lineage,
      content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
        origin: { name: b.reference.owner.name, uid: "uid" in b.reference.owner ? b.reference.owner.uid : undefined },
        kind: "abandon", successors: [], incoming: [] })) },
    { action: "remove" as const, reference: b.reference, expected: b.version }];
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: a.reference, expected: a.version, content: a.content, placement: { kind: "completed", quarter: own } },
      ...retirement,
    ], provenance }));
    if (end === "retirement") success(await h.b.store.batch({ writes: retirement, provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    else success(await h.b.store.write({ action: "put", reference: b.reference, expected: b.version, content: b.content,
      placement: { kind: "completed", quarter: remote }, provenance }));
    success(await h.b.store.write({ action: "put", reference: a.reference, expected: a.version, content: a.content,
      placement: { kind: "completed", quarter: remote }, provenance }));
    success(await h.b.store.push());
    const uid = "uid" in b.reference.owner ? b.reference.owner.uid : "";
    const observing = createRefStore({ ...h.a.ports, execInput: async (args, input, options) => {
      const result = await h.a.ports.execInput(args, input, options);
      if (args.includes("update-ref")) {
        expect((await h.a.git(["for-each-ref", "--format=%(refname)", `refs/arc/work/${uid}`])).stdout).toBe("");
      }
      return result;
    } });
    const notices = success(await observing.pull()).pulls.flatMap(row => row.notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: a.reference.owner }));
    expect(notices.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    const verify = async () => {
      const record = await h.a.store.read({ reference: b.reference });
      if (end === "archive") expect(success(record).placement).toMatchObject({ kind: "completed", quarter: remote });
      else {
        expect(record).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
        expect(JSON.parse(success(await h.a.store.read({ reference: lineage })).content)).toMatchObject({ kind: "abandon" });
      }
      expect((await h.a.git(["for-each-ref", "--format=%(refname)", `refs/arc/work/${uid}`])).stdout).toBe("");
    };
    await verify();
    success(await h.a.store.push()); success(await h.b.store.pull()); success(await h.a.store.pull());
    await verify();
  }, 20_000,
);

it.each((["default", "separate"] as const).flatMap(layout => (["edit", "end"] as const).map(sibling => ({ layout, sibling }))))(
  "inverts an existing sibling's $sibling with the withdrawn end in $layout", async ({ layout, sibling }) => {
    const h = await refSyncFixture(layout);
    const make = async (name: string) => {
      const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
      content: makeMetaFixture(name), placement: { kind: "active" }, provenance }));
      return success(await h.a.store.read({ reference: made.reference }));
    };
    const a = await make("ending-owner"), b = await make("existing-sibling");
    const companion = RecordReferenceSchema.parse({ owner: b.reference.owner, kind: "work-item/companion", key: "extra" });
    success(await h.a.store.write({ action: "put", expected: null, reference: companion, content: "Original sibling.\n", provenance }));
    const before = success(await h.a.store.read({ reference: companion }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const child = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "new-child" } });
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: a.reference, expected: a.version, content: makeMetaFixture("ending-owner"), placement: { kind: "completed", quarter: own } },
      ...(sibling === "edit" ? [{ action: "put" as const, reference: companion, expected: before.version, content: "Batch sibling edit.\n" },
        { action: "put" as const, reference: child, expected: null, content: makeMetaFixture("new-child"), placement: { kind: "active" as const } }]
        : [{ action: "put" as const, reference: b.reference, expected: b.version, content: makeMetaFixture("existing-sibling"), placement: { kind: "completed" as const, quarter: own } }]),
    ], provenance }));
    const incoming = success(await h.b.store.read({ reference: a.reference }));
    success(await h.b.store.write({ action: "put", reference: incoming.reference, expected: incoming.version, content: incoming.content,
      placement: { kind: "completed", quarter: remote }, provenance }));
    success(await h.b.store.push());
    expect(success(await h.a.store.pull()).pulls.flatMap(row => row.notices))
      .toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: a.reference.owner }));
    expect(success(await h.a.store.read({ reference: companion })).content).toBe("Original sibling.\n");
    expect(success(await h.a.store.read({ reference: b.reference })).placement).toEqual({ kind: "active" });
    if (sibling === "edit") expect(success(await h.a.store.read({ reference: child })).content).toBe(makeMetaFixture("new-child"));
    expect(success(await h.a.store.push()).publishes.every(row => row.status !== "failed")).toBe(true);
  }, 20_000);

it.each(["default", "separate"] as const)("archives a restored sibling whose published end arrives after the withdrawal in %s", async layout => {
  const h = await refSyncFixture(layout);
  const make = async (name: string) => {
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
      content: makeMetaFixture(name), placement: { kind: "active" }, provenance }));
    return success(await h.a.store.read({ reference: made.reference }));
  };
  const a = await make("ending-owner"), b = await make("later-published-sibling");
  success(await h.a.store.push()); success(await h.b.store.pull());
  success(await h.a.store.batch({ writes: [
    { action: "put", reference: a.reference, expected: a.version, content: a.content, placement: { kind: "completed", quarter: own } },
    { action: "put", expected: null, reference: RecordReferenceSchema.parse({ kind: "lineage/transition", owner: b.reference.owner }),
      content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
        origin: { name: b.reference.owner.name, uid: "uid" in b.reference.owner ? b.reference.owner.uid : undefined },
        kind: "abandon", successors: [], incoming: [] })) },
    { action: "remove", reference: b.reference, expected: b.version },
  ], provenance }));
  success(await h.b.store.write({ action: "put", reference: a.reference, expected: a.version, content: a.content,
    placement: { kind: "completed", quarter: remote }, provenance }));
  success(await h.b.store.push());
  const withdrawn = success(await h.a.store.pull()).pulls.flatMap(row => row.notices);
  expect(withdrawn).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: a.reference.owner }));
  expect(withdrawn.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  expect(success(await h.a.store.read({ reference: b.reference })).placement).toEqual({ kind: "active" });
  success(await h.b.store.write({ action: "put", reference: b.reference, expected: b.version, content: b.content,
    placement: { kind: "completed", quarter: remote }, provenance }));
  success(await h.b.store.push());
  const later = success(await h.a.store.pull()).pulls.flatMap(row => row.notices);
  expect(later.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  const uid = "uid" in b.reference.owner ? b.reference.owner.uid : "";
  for (const side of [h.a, h.b]) {
    if (side === h.b) { expect(success(await h.a.store.push()).publishes.every(row => row.status !== "failed")).toBe(true); success(await h.b.store.pull()); }
    expect(success(await side.store.read({ reference: b.reference })).placement).toMatchObject({ kind: "completed", quarter: remote });
    expect((await side.git(["for-each-ref", "--format=%(refname)", `refs/arc/work/${uid}`])).stdout).toBe("");
  }
}, 20_000);
