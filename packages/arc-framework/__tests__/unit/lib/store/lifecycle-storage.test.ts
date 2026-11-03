/** Lifecycle snapshots pin record-bound versions and read each holder's artifacts at its own path. */
import { storeRepairCases } from "../../../fixtures/store-repair-remedies.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
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


it.each(["version", "list", "unreadable", "diagnostics", "read"] as const)(
  "retains every supplied repair command in a native lifecycle snapshot %s refusal", async fault => {
    const h = createLifecycleHarness(), meta = await h.seedMeta("example");
    const storage = createStoreLifecycleStorage({ store: h.store, checkoutRoot: "/memory" });
    const version = h.store.version.bind(h.store), list = h.store.list.bind(h.store), read = h.store.read.bind(h.store);
    const repair = storeRepairCases[0]!, remedy = repair.remedy;
    const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "work-item",
      condition: "Lifecycle objects are unavailable.", remedy });
    const before = await version();
    if (fault === "version") h.store.version = async () => ({ status: "refused", refusal });
    else if (fault === "read") h.store.read = async () => ({ status: "refused", refusal });
    else h.store.list = async () => fault === "list" ? { status: "refused", refusal } : { status: "ok", result:
      fault === "unreadable" ? { status: "unreadable", condition: refusal.condition, remedy } : {
        status: "complete", records: [meta], missed: true, diagnostics: storeRepairCases.map(({ remedy: item }, i) => ({
          kind: "unreadable", key: `entry-${i}`, condition: `Entry ${i} is unavailable.`, remedy: item })) } };
    const failed = fault === "read" ? (await storage.readSnapshot()).fs.readFile(".arc/active/meta-example.md") : storage.readSnapshot();
    const error: unknown = await failed.catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : "";
    for (const { remedy: item, command } of fault === "diagnostics" ? storeRepairCases : [repair]) {
      expect(message).toContain(item.text); expect(message).toContain(command);
    }
    expect(await version()).toEqual(before);
    h.store.version = version; h.store.list = list; h.store.read = read;
    expect(await (await storage.readSnapshot()).fs.readFile(".arc/active/meta-example.md")).toBe(meta.content.trimEnd());
  });
