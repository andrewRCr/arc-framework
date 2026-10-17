/** Receipt homes keep their generation through rename and slug reuse. */
import { expect, it } from "vitest";
import { createInboxHarness } from "../../../helpers/inbox-harness.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { openErrandHolding } from "../../../../src/lib/inbox/errand-home.js";

async function first(h: ReturnType<typeof createInboxHarness>, list = "personal") {
  const result = await listInbox({ list }, h.context);
  if (result.state === "refused" || result.entries[0] === undefined) throw new Error("Readable entry required");
  return result.entries[0];
}

async function routeSurvivor(h: ReturnType<typeof createInboxHarness>, to: string) {
  const saved = await h.inbox("personal"), row = await first(h);
  const racing = Object.create(h.context.store) as typeof h.context.store;
  racing.batch = async input => {
    success(await h.context.store.write({ action: "put", reference: saved.reference, expected: saved.version,
      content: saved.content.replace("Prose", "Racing edit"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    return h.context.store.batch(input);
  };
  expect(await routeEntry({ entryId: row.id, from: "personal", expectedVersion: row.version, to }, { ...h.context, store: racing }))
    .toMatchObject({ state: "routed" });
  return first(h);
}

it.each(["former", "current", "listed"] as const)("carries to a renamed work unit by its %s selector and remains idempotent", async selector => {
  const h = createInboxHarness(), target = await h.workUnit("before");
  const row = await routeSurvivor(h, target.reference.owner.name);
  const renamed = `${target.reference.owner.name}-after`;
  success(await h.context.store.write({ action: "put", reference: { ...target.reference,
    owner: OwnerIdentitySchema.parse({ ...target.reference.owner, name: renamed }) }, expected: target.version,
    content: target.content.replaceAll(target.reference.owner.name, renamed), placement: { kind: "active" },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const listed = await first(h);
  const to = selector === "former" ? target.reference.owner.name : selector === "current" ? renamed : listed.survivor?.home.list;
  if (to === undefined) throw new Error("Survivor home required");
  const input = { entryId: row.id, from: "personal", expectedVersion: row.version, to };
  expect(await routeEntry(input, h.context)).toMatchObject({ state: "routed", carried: "replaced" });
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [] });
  expect((await first(h, renamed)).raw).toContain("Racing edit");
  expect(await routeEntry(input, h.context)).toMatchObject({ state: "already-home" });
});

it("keeps an ended Errand's old survivor ordinary when another generation reuses its slug", async () => {
  const h = createInboxHarness(), ended = await h.errand("same");
  const row = await routeSurvivor(h, ended.reference.owner.name);
  success(await h.context.store.write({ action: "put", reference: ended.reference, expected: ended.version,
    content: ended.content, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") },
    provenance: { verb: "errand-abandon", lifecycleAction: "abandon" } }));
  expect((await first(h)).survivor).toBeUndefined();
  const next = await seed(h.fixture, h.fixture.reference("work-item/record", "same"),
    JSON.stringify(TransientIdentityRecordSchema.parse({ ...JSON.parse(ended.content), claimId: "b".repeat(32) })), { kind: "active" });
  expect(next.reference.owner).not.toEqual(ended.reference.owner);
  const ordinary = await first(h);
  expect(ordinary.id).toBe(row.id);
  expect(ordinary.survivor).toBeUndefined();
  expect(await openErrandHolding(row.id, { list: "personal", identity: "test-user" }, h.context))
    .toMatchObject({ status: "ok", result: { held: null, closed: ended.reference.owner.name } });
});
