/** Sequential moves retain their actual home even when the wall clock does not advance. */
import { expect, it } from "vitest";
import { createInboxHarness } from "../../../helpers/inbox-harness.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { readRoutingReceipts } from "../../../../src/lib/inbox/receipts.js";
import { success } from "../../../helpers/store/suite-tools.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { prepareErrandAdoption } from "../../../../src/lib/inbox/errand-adoption.js";
import { prepareErrandReturn } from "../../../../src/lib/inbox/errand-return.js";

async function first(h: ReturnType<typeof createInboxHarness>, list: string) {
  const result = await listInbox({ list }, h.context);
  if (result.state === "refused" || !result.entries[0]) throw new Error(JSON.stringify(result));
  return result.entries[0];
}
it.each(["frozen", "backward"] as const)("keeps round-trip captures ordinary with a %s clock", async clock => {
  const h = createInboxHarness(); await h.inbox("personal"); await h.inbox("project", "");
  const start = h.context.now().getTime();
  for (const [index, from] of ["personal", "project", "personal"].entries()) {
    const row = await first(h, from), to = from === "personal" ? "project" : "personal";
    h.context.now = () => new Date(start - (clock === "backward" ? index * 1000 : 0));
    expect(await routeEntry({ entryId: row.id, from, expectedVersion: row.version, to, ...(to === "personal" ? { section: "Work Unit" } : {}) }, h.context)).toMatchObject({ state: "routed" });
    expect(await first(h, to)).not.toHaveProperty("survivor");
  }
  const receipts = await readRoutingReceipts(h.context);
  if (receipts.status !== "ok") throw new Error(receipts.refusal.condition);
  expect([...new Set(receipts.result.map(receipt => receipt.time))].sort()).toEqual([0, 1, 2].map(offset => new Date(start + offset).toISOString()));
  for (const kind of ["personal/routing-receipt", "project-inbox/routing-receipt"] as const) {
    const family = kind === "personal/routing-receipt" ? "personal" : "project-inbox";
    expect(success(await h.context.store.list({ family, kind }))).toMatchObject({ status: "complete", records: expect.any(Array) });
  }
});
it("orders after earlier receipts touching only the destination list", async () => {
  const h = createInboxHarness(); await h.inbox("project"); const target = await h.workUnit();
  const former = await first(h, "project");
  expect(await routeEntry({ entryId: former.id, from: "project", expectedVersion: former.version, to: target.reference.owner.name }, h.context)).toMatchObject({ state: "routed" });
  await h.inbox("personal");
  const unrelatedSource = await first(h, "personal");
  expect(await routeEntry({ entryId: unrelatedSource.id, from: "personal", expectedVersion: unrelatedSource.version, to: "project" }, h.context)).toMatchObject({ state: "routed" });
  expect(await first(h, "project")).not.toHaveProperty("survivor");
  const receipts = await readRoutingReceipts(h.context);
  if (receipts.status !== "ok") throw new Error(receipts.refusal.condition);
  const arrived = receipts.result.find(receipt => receipt.source?.list === "personal" && receipt.destination.list === "project");
  expect(Date.parse(arrived?.time ?? "")).toBe(h.context.now().getTime() + 1);
});
it("refuses insertion without complete receipt authority, writes nothing, and retries after repair", async () => {
  const h = createInboxHarness(); const destination = await h.inbox("project", ""), before = success(await h.context.store.version());
  const selected: Store = Object.create(h.context.store) as Store;
  selected.version = async () => ({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", historyRefs: [],
    condition: "Receipt history is unavailable.", remedy: { text: "Restore receipt history and retry." } } });
  const input = { to: "project", content: "### **Inserted concern**\n\nKeep its prose" };
  expect(await routeEntry(input, { ...h.context, store: selected })).toMatchObject({ state: "refused", code: "state-unresolvable", remedy: { text: expect.stringContaining("retry") } });
  expect(success(await h.context.store.version())).toBe(before);
  expect(success(await h.context.store.read({ reference: destination.reference }))).toEqual(destination);
  selected.version = () => h.context.store.version();
  expect(await routeEntry(input, { ...h.context, store: selected })).toMatchObject({ state: "routed" });
  expect(await first(h, "project")).toMatchObject({ title: "Inserted concern" });
});

it.each(["personal", "project"] as const)("orders capture link and abandon return through the shared mover for %s", async inbox => {
  const h = createInboxHarness(); await h.inbox(inbox); const target = await h.errand();
  const linked = await prepareErrandAdoption({ slug: target.reference.owner.name, from: `${inbox}:12345678` }, h.context);
  if (linked.status !== "ok") throw new Error(linked.refusal.condition);
  success(await h.context.store.batch({ writes: linked.result.writes, provenance: { verb: "errand-link", lifecycleAction: "link" } }));
  h.context.now = () => new Date("2026-02-01T11:00:00Z");
  const returned = await prepareErrandReturn(target.reference.owner.name, h.context);
  if (returned.status !== "ok") throw new Error(returned.refusal.condition);
  success(await h.context.store.batch({ writes: returned.result.writes, provenance: { verb: "errand-abandon", lifecycleAction: "abandon" } }));
  expect(await first(h, inbox)).not.toHaveProperty("survivor");
  expect(await first(h, inbox)).toMatchObject({ fields: { Created: "2026-01-01" } });
  expect(await listInbox({ list: target.reference.owner.name }, h.context)).toMatchObject({ entries: [] });
});

it("orders survivor carry after its earlier move while preserving raced prose", async () => {
  const h = createInboxHarness(), target = await h.workUnit(), saved = await h.inbox("personal"), original = await first(h, "personal");
  const racing: Store = Object.create(h.context.store) as Store;
  racing.batch = async input => {
    success(await h.context.store.write({ action: "put", reference: saved.reference, expected: saved.version,
      content: saved.content.replace("Prose", "Racing edit"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    return h.context.store.batch(input);
  };
  expect(await routeEntry({ entryId: original.id, from: "personal", expectedVersion: original.version, to: target.reference.owner.name }, { ...h.context, store: racing })).toMatchObject({ state: "routed" });
  const survivor = await first(h, "personal");
  expect(survivor).toHaveProperty("survivor");
  expect(await routeEntry({ entryId: survivor.id, from: "personal", expectedVersion: survivor.version, to: target.reference.owner.name }, h.context)).toMatchObject({ state: "routed", carried: "replaced" });
  expect((await first(h, target.reference.owner.name)).raw).toContain("Racing edit");
  const receipts = await readRoutingReceipts(h.context);
  if (receipts.status !== "ok") throw new Error(receipts.refusal.condition);
  expect([...new Set(receipts.result.map(receipt => receipt.time))].sort()).toEqual([0, 1].map(offset => new Date(h.context.now().getTime() + offset).toISOString()));
});
