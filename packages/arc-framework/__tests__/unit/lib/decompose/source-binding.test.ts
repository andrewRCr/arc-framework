/** Stored cuts bind only scanned source content and stable dependency identities. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { checkDecomposeSourceBinding } from "../../../../src/lib/decompose/source-binding.js";
import type { DecomposeContext } from "../../../../src/lib/decompose/context.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { writeMetaDependsOn, writeMetaPriority, writeMetaCurrentWorkflow, writeMetaState } from "../../../../src/lib/store/kinds/meta/writers.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { ENTRY_CONFIGS } from "../../../../src/lib/store/kinds/entry-configs.js";
import { entry } from "../../../helpers/inbox-harness.js";
import type { InboxContext } from "../../../../src/lib/inbox/types.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { parseEntryList } from "../../../../src/lib/store/kinds/entry-list.js";

async function check(ctx: DecomposeContext) {
  const acquired = await acquireDecomposeTerminal(ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  return checkDecomposeSourceBinding(ctx, acquired.result);
}

it("refuses a changed source body and continues after restoring its bound content", async () => {
  const h = await createDecomposeTerminalFixture();
  const draft = lifecycleSuccess(await h.store.read({ reference: h.draft.reference }));
  const edited = await h.handEdit(draft, draft.content.replace("Owned work.", "Changed work."));
  const before = lifecycleSuccess(await h.store.version());
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "stale-machine", locus: "machine.sourceUnits",
    remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await h.handEdit(edited, draft.content);
  expect((await check(h.ctx)).status).toBe("ok");
});

it.each(["added", "removed"] as const)("refuses a %s source section and continues after restoring its inventory", async change => {
  const h = await createDecomposeTerminalFixture();
  const draft = lifecycleSuccess(await h.store.read({ reference: h.draft.reference }));
  const edited = await h.handEdit(draft, change === "added" ? `${draft.content}\n## Added\n\nNew work.\n` : "# Origin\n\n");
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "stale-machine", locus: "machine.sourceUnits",
    remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  await h.handEdit(edited, draft.content);
  expect((await check(h.ctx)).status).toBe("ok");
});

it.each(["companion", "notes", "spec", "task-list"] as const)("refuses a %s record added after the additive batch", async role => {
  const h = await createDecomposeTerminalFixture();
  const owner = h.primary.reference.owner;
  const reference = role === "companion" ? recordReferences["work-item/companion"](owner, "review")
    : role === "notes" ? recordReferences["work-item/notes"](owner)
      : role === "spec" ? recordReferences["work-item/spec"](owner) : recordReferences["work-item/task-list"](owner);
  const content = role === "task-list" ? "# Task List: Origin\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Do work**\n"
    : "# Additional source\n\n## Added\n\nNew work.\n";
  const added = await h.seed(reference, content);
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "stale-machine", locus: "machine.sourceUnits" });
  lifecycleSuccess(await h.store.write({ action: "remove", reference: added.reference, expected: added.version,
    provenance: { verb: "decompose", lifecycleAction: "revise" } }));
  expect((await check(h.ctx)).status).toBe("ok");
});

it.each(["added", "removed"] as const)("refuses an incoming edge %s since the additive batch and continues after repair", async change => {
  const h = await createDecomposeTerminalFixture();
  const consumer = change === "added" ? await h.seedStub("new-consumer") : lifecycleSuccess(await readWorkUnit(h.store, "consumer"));
  const edited = await h.handEdit(consumer, writeMetaDependsOn(consumer.content, change === "added" ? ["origin"] : []));
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "stale-machine", locus: "machine.incomingEdges",
    remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  await h.handEdit(edited, consumer.content);
  expect((await check(h.ctx)).status).toBe("ok");
});

it.each(["added", "changed", "removed"] as const)("refuses an outgoing edge %s since the additive batch and continues after repair", async change => {
  const h = await createDecomposeTerminalFixture({ provider: change !== "added" });
  if (change !== "removed") await h.seedStub("other-provider");
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const edited = await h.handEdit(primary, writeMetaDependsOn(primary.content, change === "removed" ? [] : ["other-provider"]));
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "stale-machine", locus: "machine.outgoingEdges",
    remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  await h.handEdit(edited, primary.content);
  expect((await check(h.ctx)).status).toBe("ok");
});

it("names every entry routed to the origin after scaffolding and continues after routing them onward", async () => {
  const h = await createDecomposeTerminalFixture();
  let sequence = 0;
  const inbox: InboxContext = { store: h.store, identity: h.ctx.identity, now: () => new Date("2026-10-19T00:00:00Z"),
    random: () => (++sequence + 100) / 0x100000000, key: () => `move-${++sequence}` };
  for (const id of ["1234abcd", "2345abcd"]) {
    expect(await routeEntry({ to: "origin", content: entry(id, `Added ${id}`) }, inbox)).toMatchObject({ state: "routed", entryId: id });
  }
  expect((await check(h.ctx)).status).toBe("ok");
  h.ctx.inboundGrammar = ENTRY_CONFIGS["work-item/inbound"];
  const refusal = await check(h.ctx);
  expect(refusal).toMatchObject({ status: "refused", reason: "inbound-held" });
  if (refusal.status !== "refused") throw new Error("Expected held entries.");
  for (const id of ["1234abcd", "2345abcd"]) {
    expect(refusal.message).toContain(id);
    const inbound = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/inbound"](h.primary.reference.owner) }));
    const parsed = parseEntryList(inbound.content, "work-item/inbound");
    if (!parsed.success) throw new Error(parsed.error);
    const row = parsed.data.entries.find(candidate => candidate.id === id);
    if (row === undefined) throw new Error("Expected routed entry.");
    expect(refusal.remedy.text).toContain(`arc route ${id} --from origin --expected-version ${row.version}`);
    expect(await routeEntry({ entryId: id, from: "origin", expectedVersion: row.version, to: "member-a" }, inbox))
      .toMatchObject({ state: "routed", entryId: id });
  }
  expect((await check(h.ctx)).status).toBe("ok");
});

it("allows priority grooming and derives a started stub without comparing the old source kind", async () => {
  const h = await createDecomposeTerminalFixture();
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const groomed = await h.handEdit(primary, writeMetaPriority(primary.content, "P2"));
  expect((await check(h.ctx)).status).toBe("ok");
  lifecycleSuccess(await h.store.write({ ...recordPut(groomed, { placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(groomed.content, "draft-design") }), provenance: { verb: "start", lifecycleAction: "start" } }));
  expect(await check(h.ctx)).toMatchObject({ status: "ok", result: { sourceKind: "started-planning" } });
});

it("does not bind an Active extraction's task-list edits or its old Planning source kind", async () => {
  const h = await createDecomposeTerminalFixture({ started: true, extraction: true });
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, {
    content: writeMetaCurrentWorkflow(writeMetaState(primary.content, "Active"), "process-task-loop") }),
    provenance: { verb: "activate", lifecycleAction: "activate" } }));
  const list = await h.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Task List: Origin\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Do work**\n");
  await h.handEdit(list, list.content.replace("Do work", "Do edited work"));
  expect(await check(h.ctx)).toMatchObject({ status: "ok", result: { sourceKind: "active-origin" } });
});

it.each([false, true])("keeps dependency identities after actual provider and dependent renames, started=%s", async started => {
  const h = await createDecomposeTerminalFixture({ started, provider: true });
  for (const [sourceSlug, targetSlug] of [["provider", "foundation"], ["consumer", "client"]] as const) {
    expect(await runStoreRename({ ...h.ctx.executor, baseBranch: h.ctx.baseBranch }, { sourceSlug, targetSlug }))
      .toMatchObject({ status: "renamed" });
  }
  expect((await check(h.ctx)).status).toBe("ok");
});

it("excludes an authenticated member's new edge to the origin from the incoming inventory", async () => {
  const h = await createDecomposeTerminalFixture();
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(member, writeMetaDependsOn(member.content, ["member-b", "origin"]));
  expect((await check(h.ctx)).status).toBe("ok");
});
