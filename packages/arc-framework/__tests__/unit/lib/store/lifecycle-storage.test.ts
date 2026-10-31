/** Lifecycle snapshots pin record-bound versions and read each holder's artifacts at its own path. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../../../helpers/store/clash-double.js";
import { createStoreLifecycleStorage, workItemArtifactPath } from "../../../../src/lib/store/lifecycle-storage.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { WorkUnitReadPlacementSchema } from "../../../../src/lib/store/placement.js";
import { writeMetaState, writeMetaCurrentWorkflow, writeMetaPriority } from "../../../../src/lib/store/kinds/meta/writers.js";

it("selects every listed meta version and keeps it pinned as the store advances", async () => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("first"), second = await h.seedMeta("second");
  const storage = createStoreLifecycleStorage({ store: h.store, checkoutRoot: "/project" });
  const snapshot = await storage.readSnapshot();
  expect(snapshot.metaVersion("first")).toBe(first.version);
  expect(snapshot.metaVersion("second")).toBe(second.version);
  expect(snapshot.metaVersion("unlisted")).toBeNull();
  expect(snapshot.metaVersion("first")).not.toBe(snapshot.version);
  const advanced = lifecycleSuccess(await h.store.write({ action: "put", reference: first.reference,
    expected: first.version, placement: { kind: "active" }, content: writeMetaPriority(first.content, "P1"),
    provenance: { verb: "set-priority", lifecycleAction: "edit" } }));
  const next = await storage.readSnapshot();
  expect(next.version).not.toBe(snapshot.version);
  expect(next.metaVersion("first")).toBe(advanced.version);
  expect(snapshot.metaVersion("first")).toBe(first.version);
  expect(next.metaVersion("second")).toBe(second.version);
});

it("reads archived and live namesakes at their own metadata and companion paths", async () => {
  const h = createLifecycleHarness(), old = await h.seedMeta("shared");
  const oldNotes = await h.seed(recordReferences["work-item/notes"](old.reference.owner), "Archived notes\n");
  lifecycleSuccess(await h.store.write({ ...recordPut(old, {
    content: writeMetaCurrentWorkflow(writeMetaState(old.content, "Shipped"), null),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
  }), provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const archived = lifecycleSuccess(await h.store.read({ reference: old.reference }));
  const live = await h.seedMeta("shared");
  const liveNotes = await h.seed(recordReferences["work-item/notes"](live.reference.owner), "Live notes\n");
  const snapshot = await createStoreLifecycleStorage({ store: h.store, checkoutRoot: "/memory" }).readSnapshot();
  for (const [meta, notes] of [[archived, oldNotes], [live, liveNotes]]) {
    if (meta === undefined || notes === undefined) throw new Error("Expected both holder artifacts");
    const placement = WorkUnitReadPlacementSchema.parse(meta.placement);
    expect(await snapshot.fs.readFile(workItemArtifactPath("shared", "meta", placement, null))).toBe(meta.content.trimEnd());
    expect(await snapshot.fs.readFile(workItemArtifactPath("shared", "notes", placement, null))).toBe(notes.content.trimEnd());
  }
});

it("leaves a path projected by two live holders unreadable", async () => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("first"), second = await h.seedMeta("second");
  const store = createClashDouble(h.store, { slug: "clashed", holders: [first.reference, second.reference] });
  const snapshot = await createStoreLifecycleStorage({ store, checkoutRoot: "/memory" }).readSnapshot();
  expect((await snapshot.fs.readdir(".arc/active")).map(entry => entry.name)).toContain("meta-clashed.md");
  await expect(snapshot.fs.readFile(".arc/active/meta-clashed.md")).rejects.toMatchObject({ code: "ENOENT" });
});
