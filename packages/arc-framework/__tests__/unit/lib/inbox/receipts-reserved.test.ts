/** Reserved inbox names remain distinct from work-item generation coordinates. */
import { expect, it } from "vitest";
import { createInboxHarness, entry } from "../../../helpers/inbox-harness.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { openErrandHolding } from "../../../../src/lib/inbox/errand-home.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { prepareErrandAdoption } from "../../../../src/lib/inbox/errand-adoption.js";
import { prepareErrandReturn } from "../../../../src/lib/inbox/errand-return.js";

async function reservedItem(h: ReturnType<typeof createInboxHarness>, name: string, held = "", errand = false) {
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name });
  const content = errand ? JSON.stringify(TransientIdentityRecordSchema.parse({ version: 3, kind: "errand",
    purpose: "errand", slug: name, claimId: "a".repeat(32), createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z", intent: "Concern", branch: `chore/${name}`, origin: "description",
    originEntry: null, state: "open", savedHead: null, changeRequest: null, owner: "test-user" }))
    : makeMetaFixture(name, { owner: "test-user", state: "Active" });
  const primary = await seed(h.fixture, recordReferences[errand ? "work-item/record" : "work-item/meta"](owner), content);
  if (primary.reference.owner.type !== "work-item" || primary.reference.owner.uid === undefined) throw new Error("Work item requires UID");
  if (held) await seed(h.fixture, recordReferences["work-item/inbound"](primary.reference.owner), `## Inbound\n\n${held}\n`);
  return primary.reference.owner.uid;
}

async function first(h: ReturnType<typeof createInboxHarness>, list: string) {
  const result = await listInbox({ list }, h.context);
  if (result.state === "refused" || result.entries[0] === undefined) throw new Error("Readable source entry required");
  return result.entries[0];
}

it.each(["personal", "project"] as const)("routes from the %s inbox to its namesake UID without conflating receipts", async name => {
  const h = createInboxHarness(); await h.inbox(name);
  const uid = await reservedItem(h, name), row = await first(h, name);
  const input = { entryId: row.id, from: name, expectedVersion: row.version, to: uid };
  expect(await routeEntry(input, h.context)).toMatchObject({ state: "routed", destination: { list: uid } });
  expect(await listInbox({ list: name }, h.context)).toMatchObject({ entries: [] });
  expect(await listInbox({ list: uid }, h.context)).toMatchObject({ entries: [{ id: row.id }] });
  expect(await routeEntry(input, h.context)).toMatchObject({ state: "already-home", destination: { list: uid } });
});

it.each(["personal", "project"] as const)("carries a survivor from %s to the namesake work item's UID", async name => {
  const h = createInboxHarness(), saved = await h.inbox(name), uid = await reservedItem(h, name);
  const row = await first(h, name);
  const racing = Object.create(h.context.store) as typeof h.context.store;
  racing.batch = async input => {
    success(await h.context.store.write({ action: "put", reference: saved.reference, expected: saved.version,
      content: saved.content.replace("Prose", "Surviving edit"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    return h.context.store.batch(input);
  };
  expect(await routeEntry({ entryId: row.id, from: name, expectedVersion: row.version, to: uid }, { ...h.context, store: racing }))
    .toMatchObject({ state: "routed" });
  const survivor = await first(h, name);
  expect(survivor.survivor).toMatchObject({ home: { list: uid } });
  expect(await routeEntry({ entryId: row.id, from: name, expectedVersion: survivor.version, to: uid }, h.context))
    .toMatchObject({ state: "routed", carried: "replaced" });
  expect(await listInbox({ list: name }, h.context)).toMatchObject({ entries: [] });
  expect((await first(h, uid)).raw).toContain("Surviving edit");
});

it("refuses a project inbox ID that clashes with an unrelated namesake inbound entry without changing either", async () => {
  const h = createInboxHarness(); await h.inbox("project");
  const uid = await reservedItem(h, "project", entry("12345678", "Unrelated")), row = await first(h, "project");
  const before = success(await h.context.store.version());
  expect(await routeEntry({ entryId: row.id, from: "project", expectedVersion: row.version, to: uid }, h.context))
    .toMatchObject({ state: "refused", code: "id-clash", reason: expect.stringContaining("Unrelated") });
  expect(success(await h.context.store.version())).toBe(before);
  expect((await first(h, "project")).title).toBe("Concern");
  expect((await first(h, uid)).title).toBe("Unrelated");
});

it.each(["personal", "project"] as const)("recognizes an open Errand named %s through its routed UID", async name => {
  const h = createInboxHarness(); await h.inbox("personal");
  const uid = await reservedItem(h, name, "", true), row = await first(h, "personal");
  expect(await routeEntry({ entryId: row.id, from: "personal", expectedVersion: row.version, to: uid }, h.context))
    .toMatchObject({ state: "routed" });
  expect(await openErrandHolding(row.id, { list: "personal", identity: "test-user" }, h.context))
    .toMatchObject({ status: "ok", result: { held: { slug: name, owner: "test-user" } } });
});

it.each(["personal", "project"] as const)("re-enters the same Errand named %s without treating its slug as an inbox", async name => {
  const h = createInboxHarness(); await h.inbox("project");
  const uid = await reservedItem(h, name, "", true), row = await first(h, "project");
  expect(await routeEntry({ entryId: row.id, from: "project", expectedVersion: row.version, to: uid }, h.context))
    .toMatchObject({ state: "routed" });
  expect(await prepareErrandAdoption({ slug: name, from: `project:${row.id}` }, h.context))
    .toMatchObject({ status: "ok", result: { origin: { title: `project:${row.id}` }, writes: [] } });
  expect(await listInbox({ list: uid }, h.context)).toMatchObject({ entries: [{ id: row.id }] });
  expect(await listInbox({ list: "project" }, h.context)).toMatchObject({ entries: [] });
});

it.each(["personal", "project"] as const)("returns an Errand named %s to its actual source inbox", async name => {
  const h = createInboxHarness(); await h.inbox("project");
  const uid = await reservedItem(h, name, "", true), row = await first(h, "project");
  expect(await routeEntry({ entryId: row.id, from: "project", expectedVersion: row.version, to: uid }, h.context))
    .toMatchObject({ state: "routed" });
  h.context.now = () => new Date("2026-02-02T00:00:00Z");
  const plan = await prepareErrandReturn(name, h.context);
  expect(plan).toMatchObject({ status: "ok", result: { returned: [row.id], held: [] } });
  if (plan.status !== "ok") throw new Error(plan.refusal.condition);
  success(await h.context.store.batch({ writes: plan.result.writes, provenance: { verb: "errand-abandon", lifecycleAction: "abandon" } }));
  expect(await listInbox({ list: "project" }, h.context)).toMatchObject({ entries: [{ id: row.id, fields: { Created: "2026-01-01" } }] });
  expect(await listInbox({ list: uid }, h.context)).toMatchObject({ entries: [] });
});
