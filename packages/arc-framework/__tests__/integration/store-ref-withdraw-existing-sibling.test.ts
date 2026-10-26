/** An unpublished end's inverse includes existing sibling contributions while retaining new children. */
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

const provenance = { verb: "archive", lifecycleAction: "archive" };
const own = ArchiveQuarterSchema.parse("2027-q1"), remote = ArchiveQuarterSchema.parse("2026-q4");

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
