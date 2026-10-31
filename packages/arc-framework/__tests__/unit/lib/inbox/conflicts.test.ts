/** Entry decisions retain conflict authority through moves, adoption, and return overlays. */
import { expect, it } from "vitest";
import { createInboxHarness, entry } from "../../../helpers/inbox-harness.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { removeInboxEntry } from "../../../../src/lib/inbox/removal.js";
import { prepareErrandAdoption } from "../../../../src/lib/inbox/errand-adoption.js";
import { prepareErrandReturn } from "../../../../src/lib/inbox/errand-return.js";
import { removePartialOrigin } from "../../../../src/lib/inbox/partial-origin.js";
import { prepareEntryMove } from "../../../../src/lib/inbox/mover.js";
import { prepareSurvivorCarry } from "../../../../src/lib/inbox/carry.js";
import { resolveEntryList } from "../../../../src/lib/inbox/lists.js";
import { withoutEntry } from "../../../../src/lib/inbox/entry-text.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import type { EntryKind } from "../../../../src/lib/store/kinds/entry-configs.js";
import { inboxEntrySourceDigest } from "../../../../src/lib/user-sync/inbox-writer.js";

type Harness = ReturnType<typeof createInboxHarness>;
async function resolvedList(h: Harness, selector: string) {
  const resolved = await resolveEntryList(selector, h.context);
  if (resolved.status === "refused") throw new Error(resolved.refusal.condition);
  return resolved.result;
}
async function first(h: Harness, list: string, id = "12345678") {
  const listed = await listInbox({ list }, h.context);
  if (listed.state === "refused") throw new Error(listed.reason);
  const row = listed.entries.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error("Missing fixture entry"); return row;
}
async function dispute(h: Harness, saved: StoreRecord, document = false) {
  for (const side of ["Local", "Incoming"]) success(await h.context.store.write({ action: "put", reference: saved.reference,
    expected: saved.version, content: document ? saved.content.replace(/^(## [^\n]+)/u, `$1\n\n${side} preamble`)
      : saved.content.replace("Concern", `${side} concern`), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const current = success(await h.context.store.read({ reference: saved.reference }));
  expect(current.conflicts.length).toBeGreaterThan(0); return current;
}
async function hideSelected(h: Harness, disputed: StoreRecord, id = "12345678") {
  success(await h.context.store.write({ action: "put", reference: disputed.reference, expected: disputed.version,
    content: withoutEntry(disputed.content, disputed.reference.kind as EntryKind, id),
    provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const current = success(await h.context.store.read({ reference: disputed.reference }));
  expect(current.conflicts).toEqual(disputed.conflicts); return current;
}
async function resolve(h: Harness, reference: StoreRecord["reference"]) {
  const current = success(await h.context.store.read({ reference }));
  success(await h.context.store.write({ action: "put", reference, expected: current.version, content: current.content,
    resolves: current.conflicts, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
}
function expectConflict(result: unknown, disputed: StoreRecord) {
  expect(result).toMatchObject({ status: "refused", refusal: { code: "entry-conflicted", remedy: { text: expect.stringMatching(/resolve.*retry/isu) } } });
  for (const reference of disputed.conflicts) expect(JSON.stringify(result)).toContain(JSON.stringify(reference).replaceAll('"', '\\"'));
}
it.each([false, true])("blocks selected source routing for entry/document conflicts, document=%s, while unrelated entry edits remain available", async (document) => {
  const h = createInboxHarness(), saved = await h.inbox("personal", `${entry()}\n\n${entry("87654321", "Unrelated")}`);
  await h.inbox("project", ""); const disputed = await dispute(h, saved, document), row = await first(h, "personal");
  const before = success(await h.context.store.version());
  const result = await routeEntry({ entryId: row.id, from: "personal", expectedVersion: row.version, to: "project" }, h.context);
  expect(result).toMatchObject({ state: "refused", code: "entry-conflicted", remedy: { text: expect.stringMatching(/resolve.*retry/isu) } });
  for (const reference of disputed.conflicts) expect(JSON.stringify(result)).toContain(JSON.stringify(reference).replaceAll('"', '\\"'));
  expect(success(await h.context.store.version())).toBe(before);
  const other = await first(h, "personal", "87654321");
  expect(await routeEntry({ entryId: other.id, from: "personal", expectedVersion: other.version, to: "project" }, h.context))
    .toMatchObject({ state: document ? "refused" : "routed" });
  await resolve(h, saved.reference);
  expect(await routeEntry({ entryId: row.id, from: "personal", expectedVersion: row.version, to: "project" }, h.context)).toMatchObject({ state: "routed" });
});
it.each([false, true])("checks conflicts before removal or absence, selectedAbsent=%s", async (absent) => {
  const h = createInboxHarness(), saved = await h.inbox("personal"), row = await first(h, "personal");
  let disputed = await dispute(h, saved); if (absent) disputed = await hideSelected(h, disputed);
  const before = success(await h.context.store.version());
  const current = absent ? row : await first(h, "personal");
  const input = { list: "personal" as const, id: current.id, expectedVersion: current.version };
  expectConflict(await removeInboxEntry(input, h.context), disputed);
  expect(success(await h.context.store.version())).toBe(before);
  await resolve(h, saved.reference);
  expect(await removeInboxEntry(input, h.context)).toMatchObject({ result: { disposition: absent ? "absent" : "removed" } });
});
it("refuses a disputed missing source before receipt-backed already-home", async () => {
  const h = createInboxHarness(); await h.inbox("personal"); await h.inbox("project", "");
  const row = await first(h, "personal"), input = { entryId: row.id, from: "personal", expectedVersion: row.version, to: "project" };
  expect(await routeEntry(input, h.context)).toMatchObject({ state: "routed" });
  const moved = success(await h.context.store.read({ reference: h.fixture.reference("personal/inbox") }));
  const restored = { ...moved, content: `## Work Unit\n\n${entry()}\n` };
  success(await h.context.store.write({ action: "put", reference: moved.reference, expected: moved.version,
    content: restored.content, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const disputed = await hideSelected(h, await dispute(h, success(await h.context.store.read({ reference: moved.reference }))));
  const result = await routeEntry(input, h.context);
  expect(result).toMatchObject({ state: "refused", code: "entry-conflicted" });
  for (const reference of disputed.conflicts) expect(JSON.stringify(result)).toContain(JSON.stringify(reference).replaceAll('"', '\\"'));
  await resolve(h, moved.reference);
  expect(await routeEntry(input, h.context)).toMatchObject({ state: "already-home" });
});
it.each([false, true])("checks full and partial adoption before consuming a disputed capture, partial=%s", async (partial) => {
  const h = createInboxHarness(), saved = await h.inbox("project"), target = await h.errand();
  const disputed = await dispute(h, saved), before = success(await h.context.store.version());
  const input = { slug: target.reference.owner.name, from: "project:12345678", partial };
  expectConflict(await prepareErrandAdoption(input, h.context), disputed);
  expect(success(await h.context.store.version())).toBe(before);
  await resolve(h, saved.reference);
  const plan = await prepareErrandAdoption(input, h.context);
  if (plan.status !== "ok") throw new Error(plan.refusal.condition);
  if (plan.result.writes.length > 0) success(await h.context.store.batch({ writes: plan.result.writes, provenance: { verb: "errand-open", lifecycleAction: "open" } }));
  expect(await listInbox({ list: "project" }, h.context)).toMatchObject({ entries: partial ? [expect.objectContaining({ id: "12345678" })] : [] });
});
it("checks the resumed Errand description before accepting its retained origin", async () => {
  const h = createInboxHarness(); await h.inbox("project"); const target = await h.errand();
  const input = { slug: target.reference.owner.name, from: "project:12345678" };
  const adoption = await prepareErrandAdoption(input, h.context); if (adoption.status !== "ok") throw new Error(adoption.refusal.condition);
  success(await h.context.store.batch({ writes: adoption.result.writes, provenance: { verb: "errand-open", lifecycleAction: "open" } }));
  const description = success(await h.context.store.read({ reference: recordReferences["work-item/description"](target.reference.owner) }));
  const disputed = await dispute(h, description);
  expectConflict(await prepareErrandAdoption(input, h.context), disputed);
  await resolve(h, description.reference);
  expect(await prepareErrandAdoption(input, h.context)).toMatchObject({ status: "ok", result: { writes: [] } });
});
it("checks a destination's missing disputed ID through the shared mover and direct insertion", async () => {
  const h = createInboxHarness(); await h.inbox("personal");
  const saved = await h.inbox("project"), disputed = await hideSelected(h, await dispute(h, saved));
  const from = await resolvedList(h, "personal"), to = await resolvedList(h, "project");
  const row = await first(h, "personal"), before = success(await h.context.store.version());
  expectConflict(await prepareEntryMove({ source: from, destination: to, entry: row, section: "Inbox" }, h.context), disputed);
  expect(await routeEntry({ to: "project", content: row.raw }, h.context)).toMatchObject({ state: "refused", code: "entry-conflicted" });
  expect(success(await h.context.store.version())).toBe(before);
  await resolve(h, saved.reference);
  expect(await routeEntry({ to: "project", content: row.raw }, h.context)).toMatchObject({ state: "routed" });
});
it("does not finish whole-description return from disputed absence", async () => {
  const h = createInboxHarness(), target = await h.errand("returning", entry());
  const saved = success(await h.context.store.read({ reference: recordReferences["work-item/description"](target.reference.owner) }));
  const disputed = await hideSelected(h, await dispute(h, saved)), before = success(await h.context.store.version());
  expectConflict(await prepareErrandReturn(target.reference.owner.name, h.context), disputed);
  expect(success(await h.context.store.version())).toBe(before);
  await resolve(h, saved.reference);
  expect(await prepareErrandReturn(target.reference.owner.name, h.context)).toMatchObject({ result: { returned: [], writes: [], disposition: "absent" } });
});
it.each([false, true])("preserves destination conflicts through the first return overlay before a later entry, wholeListAbsent=%s", async (absent) => {
  const h = createInboxHarness(), saved = await h.inbox("personal", entry("22222222"));
  const disputed = await hideSelected(h, await dispute(h, saved), "22222222");
  if (absent) success(await h.context.store.write({ action: "remove", reference: disputed.reference, expected: disputed.version,
    provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const target = await h.errand("returning", `${entry("11111111", "First")}\n\n${entry("22222222", "Second")}`);
  const before = success(await h.context.store.version());
  expectConflict(await prepareErrandReturn(target.reference.owner.name, h.context), disputed);
  expect(success(await h.context.store.version())).toBe(before);
  if (absent) success(await h.context.store.write({ action: "put", reference: saved.reference, expected: null,
    content: disputed.content, resolves: disputed.conflicts, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  else await resolve(h, saved.reference);
  const plan = await prepareErrandReturn(target.reference.owner.name, h.context); if (plan.status !== "ok") throw new Error(plan.refusal.condition);
  expect(plan.result.returned).toEqual(["11111111", "22222222"]);
  success(await h.context.store.batch({ writes: plan.result.writes, provenance: { verb: "errand-abandon", lifecycleAction: "abandon" } }));
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [{ id: "11111111" }, { id: "22222222" }] });
});
it.each([false, true])("checks legacy partial-origin retention and absence, selectedAbsent=%s", async (absent) => {
  const h = createInboxHarness(), saved = await h.inbox("personal");
  let disputed = await dispute(h, saved); if (absent) disputed = await hideSelected(h, disputed);
  const title = absent ? "Concern" : (await first(h, "personal")).title;
  const binding = { originEntry: title, originEntrySourceDigest: "expected" };
  expectConflict(await removePartialOrigin(binding, h.context, () => "mismatched"), disputed);
  await resolve(h, saved.reference);
  expect(await removePartialOrigin(binding, h.context, () => "mismatched")).toMatchObject({ result: { disposition: absent ? "absent" : "retained" } });
});
it("refuses a conflict introduced during removal before claiming its result", async () => {
  const h = createInboxHarness(), saved = await h.inbox("personal"), row = await first(h, "personal");
  const write = h.context.store.write.bind(h.context.store);
  const state: { disputed?: StoreRecord } = {};
  h.context.store.write = async (input) => {
    const result = await write(input);
    if (input.provenance.verb === "inbox-remove") {
      for (const side of ["Local", "Incoming"]) success(await write({ action: "put", reference: saved.reference,
        expected: saved.version, content: saved.content.replace("Concern", `${side} concern`),
        provenance: { verb: "edit", lifecycleAction: "edit" } }));
      state.disputed = success(await h.context.store.read({ reference: saved.reference }));
      expect(state.disputed.conflicts.length).toBeGreaterThan(0);
    }
    return result;
  };
  const result = await removeInboxEntry({ list: "personal", id: row.id, expectedVersion: row.version }, h.context);
  const disputed = state.disputed; if (disputed === undefined) throw new Error("Missing race");
  expectConflict(result, disputed);
  await resolve(h, saved.reference);
  const selected = await first(h, "personal");
  h.context.store.write = write;
  expect(await removeInboxEntry({ list: "personal", id: selected.id, expectedVersion: selected.version }, h.context)).toMatchObject({ result: { disposition: "removed" } });
});
it("checks a fresh survivor citation ID against disputed destination absence", async () => {
  const h = createInboxHarness(); await h.inbox("personal");
  const target = await h.workUnit("other", "someone-else", "active", `${entry("12345678", "Held")}\n\n${entry("87654321")}`);
  const inbound = success(await h.context.store.read({ reference: recordReferences["work-item/inbound"](target.reference.owner) }));
  const disputed = await hideSelected(h, await dispute(h, inbound), "87654321");
  const source = await resolvedList(h, "personal"), destination = await resolvedList(h, target.reference.owner.name);
  const selected = await first(h, "personal"), held = await first(h, target.reference.owner.name);
  const context = { ...h.context, random: () => 0x87654321 / 0x100000000 };
  expectConflict(await prepareSurvivorCarry({ source, destination, entry: selected, section: "Inbound" }, held, context), disputed);
  await resolve(h, inbound.reference);
  const repaired = await resolvedList(h, target.reference.owner.name);
  const plan = await prepareSurvivorCarry({ source, destination: repaired, entry: selected, section: "Inbound" }, held, context);
  if (plan.status !== "ok") throw new Error(plan.refusal.condition);
  success(await h.context.store.batch({ writes: plan.result.writes, provenance: { verb: "route", lifecycleAction: "route" } }));
  expect(await listInbox({ list: target.reference.owner.name }, h.context)).toMatchObject({ entries: [{ id: "12345678" }, { id: "87654321", fields: { Cites: "12345678" } }] });
});
it.each(["remove", "insert", "adopt", "return", "partial"] as const)("keeps conflict authority after whole-list removal before %s, then continues after explicit resolution", async (operation) => {
  const h = createInboxHarness();
  const target = operation === "return" ? await h.errand("returning", entry()) : operation === "adopt" ? await h.errand("receiver") : null;
  const selector = operation === "return" ? target!.reference.owner.name : "personal";
  const saved = operation === "return"
    ? success(await h.context.store.read({ reference: recordReferences["work-item/description"](target!.reference.owner) }))
    : await h.inbox("personal");
  const row = await first(h, selector), disputed = await dispute(h, saved);
  success(await h.context.store.write({ action: "remove", reference: disputed.reference, expected: disputed.version,
    provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await h.context.store.read({ reference: saved.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  for (const reference of disputed.conflicts) expect(await h.context.store.read({ reference })).toMatchObject({ status: "ok" });
  const perform = async () => {
    if (operation === "remove") return removeInboxEntry({ list: "personal", id: row.id, expectedVersion: row.version }, h.context);
    if (operation === "insert") return routeEntry({ to: "personal", section: "Errand", content: entry() }, h.context);
    if (operation === "adopt") return prepareErrandAdoption({ slug: target!.reference.owner.name, from: "personal:12345678" }, h.context);
    if (operation === "return") return prepareErrandReturn(selector, h.context);
    return removePartialOrigin({ originEntry: "Concern", originEntrySourceDigest: inboxEntrySourceDigest(saved.content, "Concern") }, h.context, inboxEntrySourceDigest);
  };
  const before = success(await h.context.store.version()), result = await perform();
  if (operation === "insert") expect(result).toMatchObject({ state: "refused", code: "entry-conflicted" });
  else expectConflict(result, disputed);
  for (const reference of disputed.conflicts) expect(JSON.stringify(result)).toContain(JSON.stringify(reference).replaceAll('"', '\\"'));
  expect(success(await h.context.store.version())).toBe(before);
  if (operation === "insert") {
    for (const reference of disputed.conflicts) {
      const conflict = success(await h.context.store.read({ reference }));
      success(await h.context.store.write({ action: "remove", reference, expected: conflict.version, resolves: [reference],
        provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
    }
  } else success(await h.context.store.write({ action: "put", reference: saved.reference, expected: null, content: saved.content,
    resolves: disputed.conflicts, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await perform()).toMatchObject(operation === "insert" ? { state: "routed" } : { status: "ok" });
});
it("retains the deleted project inbox's exact owner when unrelated insertion recreates its document", async () => {
  const h = createInboxHarness(), original = await h.inbox("project"), disputed = await dispute(h, original);
  success(await h.context.store.write({ action: "remove", reference: disputed.reference, expected: disputed.version,
    provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await routeEntry({ to: "project", content: entry("87654321", "Unrelated") }, h.context)).toMatchObject({ state: "routed" });
  const before = success(await h.context.store.version());
  expect(await routeEntry({ to: "project", content: entry() }, h.context)).toMatchObject({ state: "refused", code: "entry-conflicted" });
  expect(success(await h.context.store.version())).toBe(before);
  const restored = await resolvedList(h, "project");
  expect(restored.reference).toEqual(original.reference);
  expect(restored.saved?.conflicts).toEqual(disputed.conflicts);
  await resolve(h, restored.reference);
  expect(await routeEntry({ to: "project", content: entry() }, h.context)).toMatchObject({ state: "routed" });
  expect(await listInbox({ list: "project" }, h.context)).toMatchObject({ entries: [{ id: "87654321" }, { id: "12345678" }] });
});
it.each(["unreadable", "missed", "diagnostic"] as const)("withholds absence on %s conflict enumeration and retries after repair", async (condition) => {
  const h = createInboxHarness(), list = h.context.store.list.bind(h.context.store);
  h.context.store.list = async (input) => {
    if (input.family !== "personal" || input.kind !== "personal/conflict-record") return list(input);
    return { status: "ok", result: condition === "unreadable" ? { status: "unreadable", condition: "Conflict refs cannot be read.", remedy: { text: "Restore readable refs, then retry." } }
      : { status: "complete", records: [], missed: condition === "missed", diagnostics: condition === "diagnostic"
        ? [{ kind: "unreadable", key: "bad-conflict", condition: "Conflict ref is unreadable.", remedy: { text: "Restore bad-conflict, then retry." } }] : [] } };
  };
  const input = { list: "personal" as const, id: "12345678", expectedVersion: "v1:0000000000000000" };
  expect(await removeInboxEntry(input, h.context)).toMatchObject({ status: "refused", refusal: { condition: expect.stringMatching(/conflict.*(?:read|incomplete)/isu) } });
  h.context.store.list = list;
  expect(await removeInboxEntry(input, h.context)).toMatchObject({ status: "ok", result: { disposition: "absent" } });
});
