/** Prepared record plans retain whole-group version authority across unrelated writes. */
import { randomUUID } from "node:crypto";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordReferences, OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { renderMetaFile, writeMetaNextAction } from "../../../src/lib/store/kinds/meta/writers.js";
import { acquireLifecycleRecords, applyPreparedLifecycleWrite } from "../../../src/lib/work-unit/prepared-lifecycle-write.js";

async function fixture() {
  const harness = createLifecycleHarness();
  const meta = await harness.seedMeta("example");
  const notes = await harness.seed(recordReferences["work-item/notes"](meta.reference.owner), "# Notes\n\nExisting.\n");
  const records = lifecycleSuccess(await acquireLifecycleRecords(harness.store, meta.reference));
  return { ...harness, meta, notes, records, writes: [recordPut(meta, { content: writeMetaNextAction(meta.content, "Next") })] };
}

describe("prepared lifecycle writes", () => {
  it("guards a selected cohort document alongside the artifact group", async () => {
    const f = await fixture();
    const cohort = await f.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })),
      "# Cohort: group\n\n**Purpose:** A concrete result.\n");
    const records = lifecycleSuccess(await acquireLifecycleRecords(f.store, f.meta.reference, [cohort.reference]));
    expect(records.map((record) => record.reference)).toContainEqual(cohort.reference);
    lifecycleSuccess(await f.store.write({ ...recordPut(cohort, { content: "# Cohort: group\n\n**Purpose:** Changed result.\n" }), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const result = await applyPreparedLifecycleWrite(f.store, { records, writes: f.writes }, { verb: "wu-reconcile", lifecycleAction: "reconcile" });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    expect(lifecycleSuccess(await f.store.read({ reference: f.meta.reference }))).toEqual(f.meta);
  });
  it("acquires companions and applies after an unrelated write", async () => {
    const f = await fixture();
    expect(f.records.map((record) => record.reference.kind)).toEqual(expect.arrayContaining(["work-item/meta", "work-item/notes"]));
    await f.seedMeta("other");
    const applied = await applyPreparedLifecycleWrite(f.store, f, { verb: "wu-reconcile", lifecycleAction: "reconcile" });
    expect(applied.status).toBe("ok");
    expect(lifecycleSuccess(await f.store.read({ reference: f.meta.reference })).content).toContain("Next Action:** Next");
  });

  it("refuses atomically when an unedited acquired companion changed", async () => {
    const f = await fixture();
    lifecycleSuccess(await f.store.write({ ...recordPut(f.notes, { content: "# Notes\n\nChanged.\n" }),
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const applied = await applyPreparedLifecycleWrite(f.store, f, { verb: "wu-reconcile", lifecycleAction: "reconcile" });
    expect(applied.status).toBe("refused");
    expect(lifecycleSuccess(await f.store.read({ reference: f.meta.reference }))).toEqual(f.meta);
    expect(lifecycleSuccess(await f.store.read({ reference: f.notes.reference })).content).toContain("Changed.");
  });
  it("lands its edit and removal with the same batch identity", async () => {
    const f = await fixture();
    const applied = await applyPreparedLifecycleWrite(f.store, { records: f.records,
      writes: [...f.writes, { action: "remove", reference: f.notes.reference, expected: f.notes.version }] },
      { verb: "wu-reconcile", lifecycleAction: "reconcile" });
    expect(applied.status).toBe("ok");
    expect((await f.store.read({ reference: f.notes.reference })).status).toBe("refused");
    const metaHistory = lifecycleSuccess(await f.store.history({ reference: f.meta.reference }));
    const notesHistory = lifecycleSuccess(await f.store.history({ reference: f.notes.reference }));
    const own = metaHistory[0]?.provenance, notes = notesHistory[0]?.provenance;
    if (own === undefined || notes === undefined || !("batchId" in own) || !("batchId" in notes)) throw new Error("Atomic batch provenance is absent");
    expect(own.batchId).toBeTruthy();
    expect(own.batchId).toBe(notes.batchId);
  });

});

it("names the supplied reference when its owner has no metadata", async () => {
  const h = createLifecycleHarness();
  const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "missing", uid: randomUUID() }));
  expect(await acquireLifecycleRecords(h.store, reference)).toMatchObject({ status: "refused", refusal: { code: "not-found", reference } });
  const meta = await h.seed(reference, renderMetaFile("missing", { state: "Active", owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop" }), { kind: "active" });
  expect(lifecycleSuccess(await acquireLifecycleRecords(h.store, meta.reference))).toEqual([meta]);
});

it("acquires only the live reference's group when its completed namesake was listed first", async () => {
  const h = createLifecycleHarness();
  const old = await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  await h.seed(recordReferences["work-item/notes"](old.reference.owner), "# Old notes\n");
  const live = await h.seedMeta("shared");
  const notes = await h.seed(recordReferences["work-item/notes"](live.reference.owner), "# Live notes\n");
  expect(lifecycleSuccess(await acquireLifecycleRecords(h.store, live.reference))).toEqual([live, notes]);
});
