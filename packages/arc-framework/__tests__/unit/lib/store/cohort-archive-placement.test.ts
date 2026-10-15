/** Completed cohort sidecars borrow the terminal member's backend-assigned sequence. */
import { describe, expect, it } from "vitest";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { MutationSchema } from "../../../../src/lib/store/write.js";
import { StoreRecordSchema } from "../../../../src/lib/store/read.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordPut, batchLifecycleWrites } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaCurrentWorkflow, writeMetaState } from "../../../../src/lib/store/kinds/meta/writers.js";
const quarter = ArchiveQuarterSchema.parse("2026-q4");
async function cohort(h: ReturnType<typeof createLifecycleHarness>, name: string, parent?: string) {
  return h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })),
    `# Cohort: ${name}\n\n**Purpose:** A concrete result.\n${parent === undefined ? "" : `\n**Parent:** \`${parent}\`\n`}`);
}
describe("cohort archive placement", () => {
  it("admits only completed placement on a cohort document", async () => {
    const h = createLifecycleHarness(), document = await cohort(h, "group");
    expect(MutationSchema.safeParse({ ...recordPut(document), placement: { kind: "completed", quarter } }).success).toBe(true);
    expect(MutationSchema.safeParse({ ...recordPut(document), placement: { kind: "active" } }).success).toBe(false);
  });
  it("requires assigned sequence and closeout letter on completed cohort reads", async () => {
    const h = createLifecycleHarness(), document = await cohort(h, "group");
    expect(StoreRecordSchema.safeParse(document).success).toBe(true);
    expect(StoreRecordSchema.safeParse({ ...document, placement: { kind: "completed", quarter, sequence: "01", closeout: "a" } }).success).toBe(true);
    for (const placement of [{ kind: "active" }, { kind: "completed", quarter }, { kind: "completed", quarter, sequence: "01" }]) {
      expect(StoreRecordSchema.safeParse({ ...document, placement }).success).toBe(false);
    }
  });
  it("borrows the member's sequence for leaf and parent independent of write order", async () => {
    const h = createLifecycleHarness(), parent = await cohort(h, "parent"), leaf = await cohort(h, "leaf", "parent");
    const meta = await h.seedMeta("example", { cohort: "parent/leaf" });
    lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(leaf, { placement: { kind: "completed", quarter } }),
      recordPut(meta, { placement: { kind: "completed", quarter }, content: writeMetaCurrentWorkflow(writeMetaState(meta.content, "Shipped"), null) }),
      recordPut(parent, { placement: { kind: "completed", quarter } })], { verb: "archive", lifecycleAction: "archive" }));
    expect(lifecycleSuccess(await h.store.read({ reference: leaf.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01", closeout: "a" });
    expect(lifecycleSuccess(await h.store.read({ reference: parent.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01", closeout: "b" });
  });
  it("allocates a standalone cohort sequence and refuses retirement with an open member", async () => {
    const h = createLifecycleHarness(), held = await cohort(h, "held"), document = await cohort(h, "free");
    await h.seedMeta("example", { cohort: "held" });
    expect((await batchLifecycleWrites(h.store, [recordPut(held, { placement: { kind: "completed", quarter } })], { verb: "archive", lifecycleAction: "archive" })).status).toBe("refused");
    lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(document, { placement: { kind: "completed", quarter } })], { verb: "archive", lifecycleAction: "archive" }));
    expect(lifecycleSuccess(await h.store.read({ reference: document.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01", closeout: "a" });
  });
});

it.each([false, true])("keeps completed cohort coordinates on repeated placement and content correction, published=%s", async (published) => {
  const h = createLifecycleHarness(); h.store.context.publication.remote = createMemoryRemote();
  const document = await cohort(h, "group");
  lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(document, { placement: { kind: "completed", quarter } })], { verb: "archive", lifecycleAction: "archive" }));
  if (published) lifecycleSuccess(await h.store.sync());
  const before = lifecycleSuccess(await h.store.read({ reference: document.reference }));
  lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(before, { placement: { kind: "completed", quarter } })], { verb: "archive", lifecycleAction: "archive" }));
  const repeated = lifecycleSuccess(await h.store.read({ reference: document.reference }));
  expect(repeated.placement).toEqual(before.placement);
  lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(repeated, { content: repeated.content + "\nCorrected context.\n", placement: { kind: "completed", quarter } })], { verb: "edit", lifecycleAction: "edit" }));
  lifecycleSuccess(await h.store.sync());
  expect(lifecycleSuccess(await h.store.read({ reference: document.reference })).placement).toEqual(before.placement);
});

it("renumbers only the unpublished cohort alongside its own closing member across two clients", async () => {
  const left = createLifecycleHarness(), right = createLifecycleHarness(), remote = createMemoryRemote();
  left.store.context.publication.remote = remote; right.store.context.publication.remote = remote;
  const archives = [];
  for (const [h, name] of [[left, "left"], [right, "right"]] as const) {
    const document = await cohort(h, name), member = await h.seedMeta(`${name}-member`, { cohort: name });
    lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(document, { placement: { kind: "completed", quarter } }),
      recordPut(member, { placement: { kind: "completed", quarter }, content: writeMetaCurrentWorkflow(writeMetaState(member.content, "Shipped"), null) })],
    { verb: "archive", lifecycleAction: "archive" }));
    archives.push({ h, document, member });
  }
  const first = archives[0]!, second = archives[1]!;
  lifecycleSuccess(await left.store.sync()); const published = lifecycleSuccess(await left.store.read({ reference: first.document.reference }));
  lifecycleSuccess(await right.store.sync()); lifecycleSuccess(await left.store.sync());
  for (const h of [left, right]) {
    expect(lifecycleSuccess(await h.store.read({ reference: first.document.reference }))).toEqual(published);
    expect(lifecycleSuccess(await h.store.read({ reference: second.member.reference })).placement).toMatchObject({ sequence: "02" });
    expect(lifecycleSuccess(await h.store.read({ reference: second.document.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "02", closeout: "a" });
  }
});
