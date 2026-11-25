/** Routing authority, duplicate IDs, refused destinations, and repaired continuations. */
import { describe, expect, it } from "vitest";
import { createInboxHarness, entry } from "../../../helpers/inbox-harness.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { LineageRecordSchema } from "../../../../src/lib/store/kinds/lineage/schema.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";

async function first(h: ReturnType<typeof createInboxHarness>, list = "personal") {
  const result = await listInbox({ list }, h.context);
  if (result.state === "refused" || result.entries[0] === undefined) throw new Error("One readable entry required");
  return result.entries[0];
}
describe("routing boundaries", () => {
  it("reports an already completed route without writing a second receipt", async () => {
    const h = createInboxHarness(); await h.inbox("personal"); await h.inbox("project", ""); const row = await first(h);
    const input = { entryId: row.id, from: "personal", expectedVersion: row.version, to: "project" };
    expect((await routeEntry(input, h.context)).state).toBe("routed");
    const before = success(await h.context.store.version());
    expect(await routeEntry(input, h.context)).toMatchObject({ state: "already-home", destination: { list: "project" } });
    expect(success(await h.context.store.version())).toBe(before);
    const gone = await routeEntry({ ...input, to: (await h.workUnit()).reference.owner.name }, h.context);
    expect(gone).toMatchObject({ state: "refused", reason: expect.stringContaining("project") });
  });
  it("refuses a non-owner's started-list removal but accepts a fresh-ID copy", async () => {
    const h = createInboxHarness(); const primary = await h.workUnit("other", "someone-else", "active", entry()); await h.inbox("project", "");
    const row = await first(h, primary.reference.owner.name);
    expect(await routeEntry({ entryId: row.id, from: primary.reference.owner.name, expectedVersion: row.version, to: "project" }, h.context)).toMatchObject({ state: "refused", reason: expect.stringContaining("someone-else"), remedy: { text: expect.stringContaining("stdin") } });
    expect((await routeEntry({ to: "project", content: row.raw.replace(/^- _Id:_.*\n?/mu, "") }, h.context)).state).toBe("routed");
  });
  it("refuses an unrelated held ID and then inserts a newly identified copy", async () => {
    const h = createInboxHarness(); await h.inbox("personal"); await h.inbox("project", entry("12345678", "Unrelated")); const row = await first(h);
    expect(await routeEntry({ entryId: row.id, from: "personal", expectedVersion: row.version, to: "project" }, h.context)).toMatchObject({ state: "refused", reason: expect.stringContaining("Unrelated"), remedy: { text: expect.stringContaining("without _Id:_") } });
    expect((await routeEntry({ to: "project", content: row.raw.replace(/^- _Id:_.*\n?/mu, "") }, h.context)).state).toBe("routed");
  });
  it.each(["Integrating", "completed", "ended-errand"])("refuses %s and then routes to an inbox", async (state) => {
    const h = createInboxHarness(); await h.inbox("personal"); await h.inbox("project", "");
    const home = state === "ended-errand" ? await h.errand("ended", "", true) : await h.workUnit("ended", "test-user", state === "completed" ? "completed" : "active", "", state === "Integrating" ? state : "Active");
    const row = await first(h);
    const input = { entryId: row.id, from: "personal", expectedVersion: row.version, to: home.reference.owner.name };
    expect(await routeEntry(input, h.context)).toMatchObject({ state: "refused", code: "destination-refused" });
    expect((await routeEntry({ ...input, to: "project" }, h.context)).state).toBe("routed");
  });
  it("redraws an inserted ID when the destination already holds the random draw", async () => {
    const h = createInboxHarness(); await h.inbox("project", entry("00000000")); const draws = [0, 0.5];
    expect(await routeEntry({ to: "project", content: "### **New**\nNew work" }, { ...h.context, random: () => draws.shift() ?? 0.5 })).toMatchObject({ state: "routed", entryId: "80000000" });
  });
  it("names cut successors when the retired destination has no primary", async () => {
    const h = createInboxHarness(); await h.inbox("personal"); const row = await first(h);
    const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "cut-work" });
    success(await h.context.store.write({ action: "put", reference: recordReferences["lineage/transition"](owner), expected: null,
      content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: "cut-work" }, kind: "decompose", successors: [{ name: "successor" }], incoming: [], outgoing: [] })), provenance: { verb: "decompose", lifecycleAction: "decompose" } }));
    expect(await routeEntry({ entryId: row.id, from: "personal", expectedVersion: row.version, to: "cut-work" }, h.context)).toMatchObject({ state: "refused", code: "destination-refused", remedy: { text: expect.stringContaining("successor") } });
  });
});
