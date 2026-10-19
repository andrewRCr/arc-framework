/** All routeable list kinds use production grammar and expose exact mutation bases. */
import { describe, expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance } from "../../../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { entryVersion } from "../../../../src/lib/store/kinds/entry-fields.js";
import type { InboxContext } from "../../../../src/lib/inbox/types.js";

function fixture() {
  const f = createReferenceFixture(undefined, { "work-item/meta": { parser: META_REGISTRATION.parser ?? null } });
  const context: InboxContext = { store: f.store, identity: "test-user", now: () => new Date("2026-01-31T12:00:00Z") };
  return { f, context };
}

describe.each(["work-unit", "errand"] as const)("disputed %s primary", kind => {
  it.each(["slug", "uid"] as const)("refuses a move selected by %s until primary authority is resolved", async selection => {
    const { f, context } = fixture(), reference = f.reference(kind === "work-unit" ? "work-item/meta" : "work-item/record");
    const content = (owner: string) => kind === "work-unit" ? makeMetaFixture(reference.owner.name, { owner, state: "Active" })
      : JSON.stringify(TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: reference.owner.name,
        claimId: "a".repeat(32), intent: "Concern", branch: `chore/${reference.owner.name}`, owner, origin: "description", originEntry: null,
        state: "open", savedHead: null, changeRequest: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }));
    const primary = await seed(f, reference, content("starter"));
    if (primary.reference.owner.type === "person" || primary.reference.owner.uid === undefined) throw new Error("Expected work-item UID");
    const selector = selection === "slug" ? primary.reference.owner.name : primary.reference.owner.uid;
    const sourceRef = kind === "work-unit" ? recordReferences["work-item/inbound"](primary.reference.owner)
      : recordReferences["work-item/description"](primary.reference.owner);
    await seed(f, sourceRef, `## ${kind === "work-unit" ? "Inbound" : "Description"}\n\n### **Held concern**\n- _Id:_ \`12345678\`\n\nPreserve me\n`);
    const destination = await seed(f, f.reference("project-inbox/inbox"), "## Inbox\n");
    const listed = await listInbox({ list: selector }, context);
    if (listed.state === "refused" || listed.entries[0] === undefined) throw new Error("Expected a held entry");
    const row = listed.entries[0], remote = f.remote(true);
    if (remote === undefined) throw new Error("Expected remote writer");
    success(await f.store.push());
    const local = success(await f.store.read({ reference })), other = success(await remote.read({ reference }));
    success(await f.store.write({ action: "put", reference, expected: local.version, content: content("alice"), placement: { kind: "active" }, provenance: testProvenance }));
    success(await remote.write({ action: "put", reference, expected: other.version, content: content("test-user"), placement: { kind: "active" }, provenance: testProvenance }));
    success(await f.store.push());
    const disputed = success(await f.store.read({ reference }));
    expect(disputed.conflicts.length).toBeGreaterThan(0);
    const source = success(await f.store.read({ reference: sourceRef })), target = success(await f.store.read({ reference: destination.reference }));
    const version = success(await f.store.version()), input = { entryId: row.id, expectedVersion: row.version, from: selector, to: "project" };
    const refused = await routeEntry(input, context);
    expect(refused).toMatchObject({ state: "refused", code: "record-conflicted" });
    if (refused.state !== "refused") throw new Error("Expected disputed primary refusal");
    for (const conflict of disputed.conflicts) expect(refused.reason).toContain(JSON.stringify(conflict));
    expect(refused.remedy.text).toMatch(/resolve.*retry/iu);
    expect(success(await f.store.version())).toBe(version);
    expect(success(await f.store.read({ reference: sourceRef }))).toEqual(source);
    expect(success(await f.store.read({ reference: destination.reference }))).toEqual(target);
    success(await f.store.write({ action: "put", reference, expected: disputed.version, content: disputed.content, placement: { kind: "active" },
      resolves: disputed.conflicts, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
    expect(await routeEntry(input, context)).toMatchObject({ state: "routed" });
    expect(await listInbox({ list: "project" }, context)).toMatchObject({ entries: [{ title: "Held concern" }] });
  });
});
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
  it.each(['- WU_Target: example', '- _WU_Target:_ `example`', '- `WU_Target: example`'])("ignores commented target examples: %s", async (target) => {
    const { f, context } = fixture();
    const content = `## Work Unit\n### **Concern**\n- _Id:_ \`12345678\`\n- _Hold:_ \`true\`\n- WU_Target: elsewhere\n<!--\n${target}\n-->\n<!-- ${target} -->\nActual prose\n`;
    await seed(f, f.reference("personal/inbox"), content);
    expect(await listInbox({ list: "personal", target: "example" }, context)).toMatchObject({ state: "clear", entries: [] });
    expect(await listInbox({ list: "personal", target: "elsewhere" }, context)).toMatchObject({ state: "named", entries: [{ id: "12345678", held: true, raw: expect.stringContaining(target) }] });
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
