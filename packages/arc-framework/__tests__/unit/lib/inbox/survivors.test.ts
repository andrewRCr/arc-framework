/** Observed-remove edits become derived survivors, then carry through the same atomic mover. */
import { expect, it } from "vitest";
import { createInboxHarness } from "../../../helpers/inbox-harness.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { LineageRecordSchema, writeLineageRecord } from "../../../../src/lib/store/kinds/lineage/index.js";
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
  expect(surviving).toMatchObject({ state: "listed", entries: [{ title: "Retitled", survivor: { home: { list: target.reference.owner.type === "work-item" ? target.reference.owner.uid : undefined } } }] });
  if (surviving.state === "refused" || surviving.entries[0] === undefined) throw new Error("Survivor required");
  expect(await routeEntry({ entryId: row.id, from: "personal", expectedVersion: surviving.entries[0].version, to: target.reference.owner.name }, h.context)).toMatchObject({ state: "routed", carried: "replaced" });
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [] });
  expect(await listInbox({ list: target.reference.owner.name }, h.context)).toMatchObject({ entries: [{ title: "Retitled", raw: expect.stringContaining("Surviving edit"), fields: { Created: "2026-02-01" } }] });
});


it.each(["abandon", "decompose"] as const)("lists a surviving edit as ordinary work after %s removes its primary, withholding unavailable terminal evidence", async kind => {
  const h = createInboxHarness(), inbox = await h.inbox("personal"), target = await h.workUnit();
  const listed = await listInbox({ list: "personal" }, h.context);
  if (listed.state !== "listed" || !listed.entries[0]) throw new Error("Entry required");
  const row = listed.entries[0], store = Object.create(h.context.store) as typeof h.context.store;
  store.batch = async input => {
    success(await h.context.store.write({ action: "put", reference: inbox.reference, expected: inbox.version, content: inbox.content.replace("Prose", "Surviving edit"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    return h.context.store.batch(input);
  };
  expect(await routeEntry({ entryId: row.id, expectedVersion: row.version, from: "personal", to: target.reference.owner.name }, { ...h.context, store })).toMatchObject({ state: "routed" });
  const primary = success(await h.context.store.read({ reference: target.reference }));
  const reference = recordReferences["lineage/transition"](primary.reference.owner);
  const lineage = LineageRecordSchema.parse({ schemaVersion: 2, kind, origin: { name: primary.reference.owner.name, uid: primary.reference.owner.type === "work-item" ? primary.reference.owner.uid : undefined },
    successors: kind === "abandon" ? [] : [{ name: "successor" }], incoming: [], ...(kind === "decompose" ? { outgoing: [] } : {}) });
  success(await h.context.store.batch({ writes: [{ action: "remove", reference: primary.reference, expected: primary.version },
    { action: "put", reference, content: writeLineageRecord(lineage), expected: null }], provenance: { verb: kind, lifecycleAction: kind } }));
  let unavailable = true;
  const observing = Object.create(h.context.store) as typeof h.context.store;
  observing.read = async input => unavailable && input.reference.kind === "lineage/transition" ? { status: "refused", refusal: {
    code: "refused", class: "terminal", message: "Terminal unavailable", condition: "Terminal unavailable", remedy: { text: "Restore lineage and retry" },
  } } : h.context.store.read(input);
  expect(await listInbox({ list: "personal" }, { ...h.context, store: observing })).toMatchObject({ state: "refused", reason: expect.stringContaining("Terminal unavailable") });
  unavailable = false;
  const repaired = await listInbox({ list: "personal" }, { ...h.context, store: observing });
  expect(repaired).toMatchObject({ state: "listed", entries: [{ id: row.id, raw: expect.stringContaining("Surviving edit") }] });
  if (repaired.state !== "listed") throw new Error("Expected repaired listing");
  expect(repaired.entries[0]?.survivor).toBeUndefined();
});
