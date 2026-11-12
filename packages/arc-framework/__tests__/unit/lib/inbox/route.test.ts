/** Routing validates the observed entry version and lands the complete move atomically. */
import { describe, expect, it } from "vitest";
import { createInboxHarness, entry } from "../../../helpers/inbox-harness.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { readRoutingReceipts } from "../../../../src/lib/inbox/receipts.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { success } from "../../../helpers/store/suite-tools.js";

async function source(h: ReturnType<typeof createInboxHarness>) {
  const listing = await listInbox({ list: "personal" }, h.context);
  if (listing.state === "refused" || listing.entries[0] === undefined) throw new Error("Fixture needs one source entry");
  return listing.entries[0];
}
describe("atomic versioned entry routes", () => {
  it.each([
    { heading: "Plain **bold** concern", title: "Plain **bold** concern", comment: "<!-- Body note. -->" },
    { heading: "Plain concern <!--\nHeading note.\n-->", title: "Plain concern", comment: "<!--\nHeading note.\n-->" },
  ])("preserves $title through personal routing and a return to the project inbox", async ({ heading, title, comment }) => {
    const h = createInboxHarness(); await h.inbox("project", entry().replace("### **Concern**", `### [x] ${heading}`) + "\n<!-- Body note. -->\nActual prose");
    await h.inbox("personal", "");
    const original = await listInbox({ list: "project" }, h.context);
    if (original.state === "refused" || !original.entries[0]) throw new Error("No source");
    expect(await routeEntry({ entryId: "12345678", from: "project", expectedVersion: original.entries[0].version,
      to: "personal", section: "Errand" }, h.context)).toMatchObject({ state: "routed" });
    const home = await source(h);
    expect(home).toMatchObject({ id: "12345678", title, raw: expect.stringContaining(comment) });
    expect(home.raw).toContain("Actual prose");
    expect(await routeEntry({ entryId: home.id, from: "personal", expectedVersion: home.version, to: "project" }, h.context)).toMatchObject({ state: "routed" });
    expect(await listInbox({ list: "project" }, h.context)).toMatchObject({ entries: [{ id: home.id, title, raw: expect.stringContaining(comment) }] });
  });
  it("moves admitted plain and checkbox headings into personal captures without changing their titles or IDs", async () => {
    const h = createInboxHarness();
    const headings = ["### Concern", "### [ ] Concern", "### `[X]` Concern", "### **Concern**"];
    await h.inbox("project", headings.map((heading, index) => entry(`${index + 1}`.repeat(8)).replace("### **Concern**", heading) + "\n<!-- Keep this comment. -->\nActual prose").join("\n\n"));
    await h.inbox("personal", "");
    const original = await listInbox({ list: "project" }, h.context);
    if (original.state === "refused") throw new Error(original.reason);
    for (const row of original.entries) {
      expect(await routeEntry({ entryId: row.id, from: "project", expectedVersion: row.version, to: "personal", section: "Work Unit" }, h.context)).toMatchObject({ state: "routed", entryId: row.id });
    }
    expect(await listInbox({ list: "project" }, h.context)).toMatchObject({ entries: [] });
    const destination = await listInbox({ list: "personal" }, h.context);
    if (destination.state === "refused") throw new Error(destination.reason);
    expect(destination.entries.map(row => ({ id: row.id, title: row.title }))).toEqual(original.entries.map(row => ({ id: row.id, title: "Concern" })));
    expect(destination.entries.map(row => row.raw.split("\n")[0])).toEqual(["### **Concern**", "### [ ] **Concern**", "### `[X]` **Concern**", "### **Concern**"]);
    for (const row of destination.entries) { expect(row.raw).toContain("<!-- Keep this comment. -->"); expect(row.raw).toContain("Actual prose"); }
    expect(success(await h.context.store.list({ family: "project-inbox", kind: "project-inbox/routing-receipt" }))).toMatchObject({ status: "complete", records: expect.arrayContaining(original.entries.map(row => expect.objectContaining({ fields: expect.objectContaining({ entryId: row.id }) }))) });
  });
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


it("keeps the listed identity and receipt when repeated managed IDs are canonicalized", async () => {
  const h = createInboxHarness();
  await h.inbox("personal", '### **Repeated**\n- _Id:_ `11111111`\n- _Id:_ `22222222`\n\nProse');
  const target = await h.workUnit();
  const listed = await listInbox({ list: "personal" }, h.context);
  if (listed.state !== "listed" || !listed.entries[0]) throw new Error("Entry required");
  const row = listed.entries[0];
  expect(await routeEntry({ entryId: row.id, expectedVersion: row.version, from: "personal", to: target.reference.owner.name }, h.context)).toMatchObject({ state: "routed", entryId: "11111111" });
  expect(await listInbox({ list: target.reference.owner.name }, h.context)).toMatchObject({ entries: [{ id: "11111111", fields: { Id: "11111111" } }] });
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [] });
  const receipts = await readRoutingReceipts(h.context);
  expect(receipts).toMatchObject({ status: "ok", result: [{ entryId: "11111111" }] });
});
