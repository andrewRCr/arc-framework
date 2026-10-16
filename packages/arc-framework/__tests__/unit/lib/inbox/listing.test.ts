/** All routeable list kinds use production grammar and expose exact mutation bases. */
import { describe, expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed } from "../../../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { entryVersion } from "../../../../src/lib/store/kinds/entry-fields.js";
import type { InboxContext } from "../../../../src/lib/inbox/types.js";

function fixture() {
  const f = createReferenceFixture(undefined, { "work-item/meta": { parser: META_REGISTRATION.parser ?? null } });
  const context: InboxContext = { store: f.store, identity: "test-user", now: () => new Date("2026-01-31T12:00:00Z") };
  return { f, context };
}
describe("store inbox listing", () => {
  it.each(["personal", "project", "work-unit", "errand"])("lists %s IDs, versions, and original bytes", async (selector) => {
    const { f, context } = fixture();
    const kind = selector === "personal" ? "personal/inbox" : selector === "project" ? "project-inbox/inbox" : selector === "work-unit" ? "work-item/inbound" : "work-item/description";
    const reference = f.reference(kind);
    const primary = f.reference(selector === "errand" ? "work-item/record" : "work-item/meta");
    if (selector === "work-unit") await seed(f, primary, makeMetaFixture(primary.owner.name, { owner: "test-user", state: "Planning" }));
    if (selector === "errand") await seed(f, primary, JSON.stringify(TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: primary.owner.name, claimId: "a".repeat(32), createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", intent: "Concern", branch: `chore/${primary.owner.name}`, origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null, owner: "test-user" })));
    const section = selector === "personal" ? "Work Unit" : selector === "project" ? "Inbox" : selector === "work-unit" ? "Inbound" : "Description";
    const raw = '### **Concern**\n- _Created:_ `2026-01-01`\n- _Id:_ `12345678`\n\nProse';
    const saved = await seed(f, reference, `## ${section}\n${raw}\n`);
    const result = await listInbox({ list: ["personal", "project"].includes(selector) ? selector : primary.owner.name }, context);
    expect(result.state, JSON.stringify(result)).toBe("listed");
    if (result.state !== "refused") expect(result.entries).toMatchObject([{ id: "12345678", version: entryVersion({ section, bytes: raw }), raw, sourceVersion: saved.version }]);
  });
  it("filters all target spellings and refuses target filters on other lists", async () => {
    const { f, context } = fixture();
    await seed(f, f.reference("personal/inbox"), '## Work Unit\n### **Concern**\n- WU_Target: example\n- _Id:_ `12345678`\n');
    expect((await listInbox({ list: "personal", target: "example" }, context)).state).toBe("named");
    expect((await listInbox({ list: "personal", target: "elsewhere" }, context)).state).toBe("clear");
    expect(await listInbox({ list: "project", target: "example" }, context)).toMatchObject({ state: "refused", remedy: { text: expect.stringContaining("arc inbox personal --target") } });
  });
  it("reports pending figures and a re-triage offer only for a nonempty backlog stub", async () => {
    const { f, context } = fixture();
    const reference = f.reference("work-item/meta");
    const primary = await seed(f, reference, makeMetaFixture(reference.owner.name, { owner: "test-user", state: "Planning" }), { kind: "backlog", commitment: "planned" });
    await seed(f, f.reference("work-item/inbound"), '## Inbound\n### **Concern**\n- _Created:_ `2026-01-01`\n- _Id:_ `12345678`\n');
    expect(await listInbox({ list: primary.reference.owner.name }, context)).toMatchObject({ state: "listed", pending: { count: 1, oldestDate: "2026-01-01", oldestAgeDays: 30 }, retriage: { text: expect.stringContaining("1") } });
  });
  it("preserves incomplete listing evidence rather than offering an empty list", async () => {
    const { f, context } = fixture();
    const ref = f.reference("project-inbox/inbox");
    await seed(f, ref);
    f.plant(ref, "family-unreadable");
    const result = await listInbox({ list: "project" }, context);
    expect(result.state).toBe("refused");
    if (result.state === "refused") expect(result.provenance).toBeDefined();
  });
});

it("lists a work item named personal by generation UID while personal still selects the inbox", async () => {
  const { f, context } = fixture();
  const { OwnerIdentitySchema, recordReferences } = await import("../../../../src/lib/store/identity.js");
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "personal" });
  const primary = await seed(f, recordReferences["work-item/meta"](owner), makeMetaFixture("personal", { owner: "test-user", state: "Planning" }));
  await seed(f, recordReferences["work-item/inbound"](primary.reference.owner), '## Inbound\n### **Owned entry**\n- _Id:_ `12345678`\n');
  if (primary.reference.owner.type === "person" || primary.reference.owner.uid === undefined) throw new Error("Stored work item needs its UID");
  expect(await listInbox({ list: primary.reference.owner.uid }, context)).toMatchObject({ state: "listed", entries: [{ title: "Owned entry" }] });
  expect(await listInbox({ list: "personal" }, context)).toMatchObject({ state: "listed", entries: [] });
});

it("offers no re-triage for an empty backlog list or a nonempty started list", async () => {
  const { f, context } = fixture();
  const primary = f.reference("work-item/meta");
  const saved = await seed(f, primary, makeMetaFixture(primary.owner.name, { owner: "test-user", state: "Planning" }), { kind: "backlog", commitment: "planned" });
  const empty = await listInbox({ list: primary.owner.name }, context);
  if (empty.state === "refused") throw new Error(empty.reason);
  expect(empty.retriage).toBeUndefined();
  await seed(f, f.reference("work-item/inbound"), '## Inbound\n### **Concern**\n- _Created:_ `2026-01-01`\n- _Id:_ `12345678`\n');
  const changed = await f.store.write({ action: "put", reference: saved.reference, expected: saved.version, content: saved.content, placement: { kind: "active" }, provenance: { verb: "activate", lifecycleAction: "activate" } });
  expect(changed.status).toBe("ok");
  const started = await listInbox({ list: primary.owner.name }, context);
  if (started.state === "refused") throw new Error(started.reason);
  expect(started.pending?.count).toBe(1);
  expect(started.retriage).toBeUndefined();
});
