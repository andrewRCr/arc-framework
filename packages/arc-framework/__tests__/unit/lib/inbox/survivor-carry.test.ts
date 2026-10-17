/** Survivor carries preserve other writers, use citing entries where replacement is forbidden, and stay atomic. */
import { describe, expect, it } from "vitest";
import { createInboxHarness, entry } from "../../../helpers/inbox-harness.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";

async function racedSurvivor(owner = "test-user") {
  const h = createInboxHarness(), saved = await h.inbox("personal"), target = await h.workUnit("target", owner);
  const original = await listInbox({ list: "personal" }, h.context);
  if (original.state === "refused" || original.entries[0] === undefined) throw new Error("Source required");
  const row = original.entries[0];
  const racingStore = Object.create(h.context.store) as typeof h.context.store;
  racingStore.batch = async (input) => {
    success(await h.context.store.write({ action: "put", reference: saved.reference, expected: saved.version, content: saved.content.replace("Prose", "New survivor prose"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    return h.context.store.batch(input);
  };
  expect((await routeEntry({ entryId: row.id, from: "personal", expectedVersion: row.version, to: target.reference.owner.name }, { ...h.context, store: racingStore })).state).toBe("routed");
  const survivor = await listInbox({ list: "personal" }, h.context);
  if (survivor.state === "refused" || survivor.entries[0] === undefined) throw new Error("Survivor required");
  return { h, target, row: survivor.entries[0], input: { entryId: row.id, from: "personal", expectedVersion: survivor.entries[0].version, to: target.reference.owner.name } };
}
describe("survivor carry boundaries", () => {
  it.each([
    { heading: "Updated concern", title: "Updated concern" },
    { heading: "Updated **bold** concern", title: "Updated **bold** concern" },
    { heading: "Updated concern <!--\nHeading note.\n-->", title: "Updated concern" },
  ])("normalizes a survivor's edited $heading when replacing its held personal capture", async ({ heading, title }) => {
    const h = createInboxHarness();
    const saved = await h.inbox("project", entry() + "\n- _Hold:_ `true`\n<!-- Keep this comment. -->\nActual prose");
    await h.inbox("personal", "");
    const listed = await listInbox({ list: "project" }, h.context);
    if (listed.state === "refused" || !listed.entries[0]) throw new Error("No capture");
    const racing = Object.create(h.context.store) as typeof h.context.store;
    racing.batch = async input => {
      success(await h.context.store.write({ action: "put", reference: saved.reference, expected: saved.version,
        content: saved.content.replace("### **Concern**", `### [x] ${heading}`).replace("Actual prose", "Surviving prose"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
      return h.context.store.batch(input);
    };
    const route = { entryId: "12345678", from: "project", expectedVersion: listed.entries[0].version, to: "personal", section: "Errand" };
    expect(await routeEntry(route, { ...h.context, store: racing })).toMatchObject({ state: "routed" });
    const survivor = await listInbox({ list: "project" }, h.context);
    if (survivor.state === "refused" || !survivor.entries[0]) throw new Error("No survivor");
    h.context.now = () => new Date("2026-02-02T12:00:00Z");
    expect(await routeEntry({ ...route, expectedVersion: survivor.entries[0].version }, h.context)).toMatchObject({ state: "routed", carried: "replaced" });
    expect(await listInbox({ list: "project" }, h.context)).toMatchObject({ entries: [] });
    const home = await listInbox({ list: "personal" }, h.context);
    expect(home).toMatchObject({ entries: [{ id: "12345678", title, held: true, fields: { Created: "2026-02-01" }, raw: expect.stringContaining(`### [x] **${title}**`) }] });
    if (home.state !== "refused") { expect(home.entries[0]?.raw).toContain("<!-- Keep this comment. -->"); expect(home.entries[0]?.raw).toContain("Surviving prose"); }
  });
  it("inserts a citing entry into another person's started work unit", async () => {
    const { h, target, input, row } = await racedSurvivor("someone-else");
    expect(await routeEntry(input, h.context)).toMatchObject({ state: "routed", carried: "cited" });
    const home = await listInbox({ list: target.reference.owner.name }, h.context);
    expect(home).toMatchObject({ entries: [expect.objectContaining({ id: row.id }), expect.objectContaining({ fields: expect.objectContaining({ Cites: row.id }), raw: expect.stringContaining("New survivor prose") })] });
    expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [] });
  });
  it("preserves a destination edit racing replacement as a conflict instead of overwriting it", async () => {
    const { h, target, input } = await racedSurvivor();
    const ref = recordReferences["work-item/inbound"](target.reference.owner);
    const saved = success(await h.context.store.read({ reference: ref }));
    const racingStore = Object.create(h.context.store) as typeof h.context.store;
    racingStore.batch = async (batch) => {
      success(await h.context.store.write({ action: "put", reference: ref, expected: saved.version, content: saved.content.replace("Prose", "Owner edit"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
      return h.context.store.batch(batch);
    };
    expect((await routeEntry(input, { ...h.context, store: racingStore })).state).toBe("routed");
    const destination = success(await h.context.store.read({ reference: ref }));
    expect(destination.content).toContain("Owner edit");
    expect(destination.conflicts).toHaveLength(1);
    expect(success(await h.context.store.read({ reference: destination.conflicts[0] ?? ref })).content).toContain("New survivor prose");
  });
  it("a failed atomic batch leaves the survivor, and a successful retry leaves only its carry", async () => {
    const { h, input } = await racedSurvivor();
    const failingStore = Object.create(h.context.store) as typeof h.context.store;
    failingStore.batch = async () => { throw new Error("Simulated crash before commit"); };
    await expect(routeEntry(input, { ...h.context, store: failingStore })).rejects.toThrow("Simulated crash");
    expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [expect.anything()] });
    expect((await routeEntry(input, h.context)).state).toBe("routed");
    expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [] });
  });
  it("lists a survivor as ordinary work once its home completes", async () => {
    const { h, target } = await racedSurvivor();
    success(await h.context.store.write({ action: "put", reference: target.reference, content: target.content.replace("`Active`", "`Shipped`"), expected: target.version, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const listing = await listInbox({ list: "personal" }, h.context);
    if (listing.state === "refused") throw new Error(listing.reason);
    expect(listing.entries[0]?.survivor).toBeUndefined();
  });
});
