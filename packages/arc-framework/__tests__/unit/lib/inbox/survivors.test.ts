/** Observed-remove edits become derived survivors, then carry through the same atomic mover. */
import { expect, it } from "vitest";
import { createInboxHarness } from "../../../helpers/inbox-harness.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";

it("lists a racing edit with its home and carries its new prose into the owner's held entry", async () => {
  const h = createInboxHarness(); const saved = await h.inbox("personal"); const target = await h.workUnit();
  const listing = await listInbox({ list: "personal" }, h.context);
  if (listing.state === "refused" || listing.entries[0] === undefined) throw new Error("Source entry required");
  const row = listing.entries[0];
  let raced = false;
  const racingStore = Object.create(h.context.store) as typeof h.context.store;
  racingStore.batch = async (input) => {
    if (!raced) {
      raced = true;
      success(await h.context.store.write({ action: "put", reference: saved.reference, expected: saved.version, content: saved.content.replace("Concern", "Retitled").replace("Prose", "Surviving edit"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    }
    return h.context.store.batch(input);
  };
  const context = { ...h.context, store: racingStore };
  expect((await routeEntry({ entryId: row.id, from: "personal", expectedVersion: row.version, to: target.reference.owner.name }, context)).state).toBe("routed");
  const surviving = await listInbox({ list: "personal" }, h.context);
  expect(surviving).toMatchObject({ state: "listed", entries: [{ title: "Retitled", survivor: { home: { list: target.reference.owner.name } } }] });
  if (surviving.state === "refused" || surviving.entries[0] === undefined) throw new Error("Survivor required");
  expect(await routeEntry({ entryId: row.id, from: "personal", expectedVersion: surviving.entries[0].version, to: target.reference.owner.name }, h.context)).toMatchObject({ state: "routed", carried: "replaced" });
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [] });
  expect(await listInbox({ list: target.reference.owner.name }, h.context)).toMatchObject({ entries: [{ title: "Retitled", raw: expect.stringContaining("Surviving edit"), fields: { Created: "2026-02-01" } }] });
});
