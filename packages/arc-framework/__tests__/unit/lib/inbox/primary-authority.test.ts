/** Entry moves retain lifecycle and ownership authority through the atomic commit. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess as ok } from "../../../helpers/store/lifecycle-harness.js";
import { entry } from "../../../helpers/inbox-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { readRoutingReceipts } from "../../../../src/lib/inbox/receipts.js";
import type { InboxContext } from "../../../../src/lib/inbox/types.js";

it.each(["destination-state", "source-owner"] as const)("refuses changed %s without moving entries, then retries after repair", async race => {
  const h = createLifecycleHarness(), primary = await h.seedMeta("target", { owner: "alice" });
  const person = OwnerIdentitySchema.parse({ type: "person", name: "alice" });
  const sourceRef = race === "source-owner" ? recordReferences["work-item/inbound"](primary.reference.owner) : recordReferences["personal/inbox"](person);
  await h.seed(sourceRef, `## ${race === "source-owner" ? "Inbound" : "Work Unit"}\n\n${entry()}`);
  let sequence = 0;
  const context: InboxContext = { store: h.store, identity: "alice", now: () => new Date("2026-02-01"), key: () => `receipt-${sequence++}` };
  const from = race === "source-owner" ? "target" : "personal", to = race === "source-owner" ? "project" : "target";
  const listed = await listInbox({ list: from }, context);
  if (listed.state !== "listed" || !listed.entries[0]) throw new Error("Entry required");
  const source = listed.entries[0], store = Object.create(h.store) as typeof h.store;
  store.batch = async input => {
    ok(await h.store.write({ ...recordPut(primary, { content: renderMetaFile("target", {
      owner: race === "source-owner" ? "other" : "alice", state: race === "destination-state" ? "Integrating" : "Active",
    }) }), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    return h.store.batch(input);
  };
  const input = { entryId: source.id, expectedVersion: source.version, from, to };
  expect(await routeEntry(input, { ...context, store })).toMatchObject({ state: "refused", code: "version-conflict" });
  expect(await listInbox({ list: from }, context)).toMatchObject({ entries: [{ id: source.id, raw: source.raw }] });
  expect(await listInbox({ list: to }, context)).toMatchObject({ entries: [] });
  expect(await readRoutingReceipts(context)).toMatchObject({ status: "ok", result: [] });
  const changed = ok(await h.store.read({ reference: primary.reference }));
  ok(await h.store.write({ ...recordPut(changed, { content: primary.content }), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await routeEntry(input, context)).toMatchObject({ state: "routed" });
  expect(await listInbox({ list: from }, context)).toMatchObject({ entries: [] });
  expect(await listInbox({ list: to }, context)).toMatchObject({ entries: [{ id: source.id }] });
});

it("refuses inconsistent primary versions when source and destination are the same work item", async () => {
  const h = createLifecycleHarness(), primary = await h.seedMeta("target", { owner: "alice" });
  await h.seed(recordReferences["work-item/inbound"](primary.reference.owner), `## Inbound\n\n${entry()}`);
  const store = Object.create(h.store) as typeof h.store;
  let reads = 0;
  store.read = async input => {
    if (input.reference.kind === "work-item/meta" && ++reads === 2) ok(await h.store.write({ ...recordPut(primary, {
      content: renderMetaFile("target", { owner: "alice", state: "Active", priority: "P2" }),
    }), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    return h.store.read(input);
  };
  const context: InboxContext = { store: h.store, identity: "alice", now: () => new Date("2026-02-01"), key: () => "same-home" };
  const listed = await listInbox({ list: "target" }, context);
  if (listed.state !== "listed" || !listed.entries[0]) throw new Error("Entry required");
  const row = listed.entries[0], input = { entryId: row.id, expectedVersion: row.version, from: "target", to: "target" };
  expect(await routeEntry(input, { ...context, store })).toMatchObject({ state: "refused", code: "version-conflict" });
  expect(await listInbox({ list: "target" }, context)).toMatchObject({ entries: [{ id: row.id, raw: row.raw }] });
  expect(await routeEntry(input, context)).toMatchObject({ state: "routed" });
});
