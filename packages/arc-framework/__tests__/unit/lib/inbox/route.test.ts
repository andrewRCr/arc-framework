/** Routing validates the observed entry version and lands the complete move atomically. */
import { describe, expect, it } from "vitest";
import { createInboxHarness } from "../../../helpers/inbox-harness.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { success } from "../../../helpers/store/suite-tools.js";

async function source(h: ReturnType<typeof createInboxHarness>) {
  const listing = await listInbox({ list: "personal" }, h.context);
  if (listing.state === "refused" || listing.entries[0] === undefined) throw new Error("Fixture needs one source entry");
  return listing.entries[0];
}
describe("atomic versioned entry routes", () => {
  it("moves into an inbound list and reports its receipt-backed destination", async () => {
    const h = createInboxHarness(); await h.inbox("personal"); const target = await h.workUnit();
    const row = await source(h);
    expect(await routeEntry({ entryId: row.id, from: "personal", expectedVersion: row.version, to: target.reference.owner.name }, h.context)).toMatchObject({ state: "routed", entryId: row.id, destination: { list: target.reference.owner.type === "work-item" ? target.reference.owner.uid : undefined, section: "Inbound" } });
    expect((await listInbox({ list: "personal" }, h.context))).toMatchObject({ state: "listed", entries: [] });
    expect((await listInbox({ list: target.reference.owner.name }, h.context))).toMatchObject({ state: "listed", entries: [{ id: row.id }] });
  });
  it("refuses a changed entry at the stale version; its fresh version then routes", async () => {
    const h = createInboxHarness(); const saved = await h.inbox("personal"); await h.inbox("project", ""); const row = await source(h);
    success(await h.context.store.write({ action: "put", reference: saved.reference, expected: saved.version, content: saved.content.replace("Prose", "Edited"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const fresh = await source(h);
    expect(await routeEntry({ entryId: row.id, from: "personal", expectedVersion: row.version, to: "project" }, h.context)).toMatchObject({ state: "refused", code: "changed-entry", foundVersion: fresh.version });
    expect(await routeEntry({ entryId: row.id, from: "personal", expectedVersion: fresh.version, to: "project" }, h.context)).toMatchObject({ state: "routed" });
  });
  it("requires the personal destination's section and stamps an inserted identity before its receipt", async () => {
    const h = createInboxHarness();
    const input = { to: "personal", content: "### **Inserted**\n\nNew work" };
    expect(await routeEntry(input, h.context)).toMatchObject({ state: "refused", remedy: { text: expect.stringContaining("Work Unit") } });
    const routed = await routeEntry({ ...input, section: "Errand" }, h.context);
    expect(routed.state).toBe("routed");
    if (routed.state === "refused") return;
    const receipts = success(await h.context.store.list({ family: "personal", kind: "personal/routing-receipt" }));
    expect(receipts).toMatchObject({ status: "complete", records: [{ fields: { entryId: routed.entryId, source: null } }] });
  });
});
