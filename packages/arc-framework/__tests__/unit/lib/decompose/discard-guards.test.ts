/** Removal refusals preserve the repair route for a cut's surviving owners. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeDiscard } from "../../../../src/lib/decompose/discard.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { runStoreAbandon } from "../../../../src/lib/work-unit/verbs/abandon-store.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { writeMetaDependsOn, writeMetaCohort } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runPause } from "../../../../src/lib/work-unit/verbs/pause-handover.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { writeCohortDocument } from "../../../../src/lib/store/kinds/cohort/index.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { ENTRY_CONFIGS } from "../../../../src/lib/store/kinds/entry-configs.js";
import { splitEntryList } from "../../../../src/lib/store/concurrency/entries.js";
import { entryVersion } from "../../../../src/lib/store/kinds/entry-fields.js";
import { prepareDecomposeDiscard } from "../../../../src/lib/decompose/discard-plan.js";
import { checkDecomposeRemovals } from "../../../../src/lib/decompose/removal-guards.js";

async function discard(h: Awaited<ReturnType<typeof createDecomposeTerminalFixture>>, origin = "origin") {
  const preview = await runStoreDecomposeDiscard(h.ctx, origin);
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect((await runStoreDecomposeDiscard(h.ctx, origin, { applyAuthority: preview.result.applyAuthority })).status).toBe("ok");
}

it("refuses removing a started member and discards after that member is abandoned", async () => {
  const h = await createDecomposeTerminalFixture();
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  lifecycleSuccess(await h.store.write({ ...recordPut(member, { placement: { kind: "active" } }),
    provenance: { verb: "start", lifecycleAction: "start" } }));
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeDiscard(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "started-member-removal",
    remedy: { text: expect.stringContaining("arc abandon member-a") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  expect(await runStoreAbandon(h.ctx, { name: "member-a", confirmed: true })).toMatchObject({ status: "abandoned" });
  await discard(h);
});

it("counts a retained member's edge after the prepared writes settle it", async () => {
  const h = await createDecomposeTerminalFixture();
  const plan = await prepareDecomposeDiscard(h.ctx, "origin");
  if (plan.status === "refused") throw new Error(JSON.stringify(plan));
  const retained = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const removals = plan.result.writes.filter(write => write.reference.owner.name === "member-b");
  const input = { records: plan.result.records, writes: removals, routeTo: "member-a" };
  expect(await checkDecomposeRemovals(h.ctx, input)).toMatchObject({ reason: "removed-stub-held" });
  expect(await checkDecomposeRemovals(h.ctx, { ...input, writes: [...removals,
    recordPut(retained, { content: writeMetaDependsOn(retained.content, []) })] })).toBeUndefined();
});

it("names each held inbound entry's routing version and admits after a direct store move", async () => {
  const h = await createDecomposeTerminalFixture();
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const inbound = await h.seed(recordReferences["work-item/inbound"](member.reference.owner),
    "# Inbound\n\n## Inbound\n\n### First concern\n\n_Id:_ `1234abcd`\n\nRetain this work.\n\n### Second concern\n\n_Id:_ `2345bcde`\n\nRetain this too.\n");
  expect((await runStoreDecomposeDiscard(h.ctx, "origin")).status).toBe("ok");
  h.ctx.inboundGrammar = ENTRY_CONFIGS["work-item/inbound"];
  const grammar = h.ctx.inboundGrammar;
  if (grammar === undefined) throw new Error("Expected declared inbound grammar.");
  const before = lifecycleSuccess(await h.store.version());
  const refusal = await runStoreDecomposeDiscard(h.ctx, "origin");
  expect(refusal).toMatchObject({ status: "refused", reason: "inbound-held" });
  if (refusal.status !== "refused") throw new Error(JSON.stringify(refusal));
  for (const entry of splitEntryList(inbound.content, grammar).parts.filter(part => part.kind === "entry")) {
    expect(refusal.remedy.text).toContain(`arc route ${entry.id} --from member-a --expected-version ${entryVersion(entry)} --to origin`);
  }
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const destination = recordReferences["work-item/inbound"](origin.reference.owner);
  lifecycleSuccess(await h.store.batch({ writes: [recordPut(inbound, { content: "# Inbound\n\n## Inbound\n" }),
    { action: "put", reference: destination, expected: null, content: inbound.content }],
    provenance: { verb: "route", lifecycleAction: "route" } }));
  await discard(h);
  const retained = lifecycleSuccess(await h.store.read({ reference: destination }));
  for (const id of ["1234abcd", "2345bcde"]) expect(retained.content).toContain(id);
});

it.each(["work-item", "cohort"] as const)("retains a cut's new cohort while an open %s holds it", async kind => {
  const h = await createDecomposeTerminalFixture();
  const holder = kind === "cohort" ? await h.seedCohort("group/outsider") : await h.seedStub("outsider");
  if (kind === "work-item") await h.handEdit(holder, writeMetaCohort(holder.content, "group"));
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeDiscard(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "removed-cohort-held",
    message: expect.stringContaining("outsider"), remedy: { text: expect.stringMatching(/write-back/u) } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const current = lifecycleSuccess(await h.store.read({ reference: holder.reference }));
  const content = kind === "work-item" ? writeMetaCohort(current.content, null)
    : writeCohortDocument(h.ctx.cohortTemplate, "outsider", "Independent coordination.");
  if (content === null) throw new Error("Expected cohort content.");
  await h.handEdit(current, content);
  await discard(h);
  expect((await h.store.read({ reference: holder.reference })).status).toBe("ok");
});

it("requires a removed member's own cut to be discarded first", async () => {
  const h = await createDecomposeTerminalFixture();
  const preflight = await prepareDecomposePreflight(h.ctx, "member-a");
  if (preflight.status === "refused") throw new Error(JSON.stringify(preflight));
  const map = completeCutMapFixture(preflight.result.machine);
  for (const destination of map.authoring.destinations) if (destination.kind === "new-member")
    destination.slug = destination.destinationId === "member-a" ? "alpha" : "beta";
  for (const allocation of map.authoring.sourceAllocations) if (allocation.disposition.kind === "target")
    allocation.disposition.targetLocator.artifact = "draft-alpha.md";
  map.authoring.internalEdges = [{ from: "alpha", to: "beta" }];
  for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["beta"] };
  map.authoring.placement = { kind: "cohort", cohort: "inner-group", purpose: "Coordinate the member's cut." };
  expect((await runStoreDecomposeAdditive(h.ctx, "member-a", "execute", { cutMap: map, cutMapPath: "inner-cut.json" })).status).toBe("ok");
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeDiscard(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "removed-stub-cut",
    remedy: { argv: ["arc", "decompose", "member-a", "--discard"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await discard(h, "member-a");
  await discard(h);
});

it.each(["depends-on", "waits-on", "renamed-waits-on"] as const)("protects a surviving %s edge and admits owner repair", async kind => {
  const h = await createDecomposeTerminalFixture();
  if (kind === "renamed-waits-on") expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
    { sourceSlug: "member-a", targetSlug: "delta" })).toMatchObject({ status: "renamed" });
  const outsider = kind === "depends-on" ? await h.seedStub("outsider")
    : await h.seedMeta("outsider", { state: "Active", currentWorkflow: "process-task-loop" });
  const pause = { store: h.store, cwd: "/repo", baseBranch: "main", now: () => new Date("2026-10-19T00:00:00Z"),
    locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null },
    exec: scriptGitExec([{ match: ["remote"], responses: [{ stdout: "" }, { stdout: "" }] }]).exec };
  if (kind === "depends-on") await h.handEdit(outsider, writeMetaDependsOn(outsider.content, ["member-a"]));
  else expect(await runPause(pause, { name: "outsider", identity: h.ctx.identity, reason: "Waiting for the member.", waitsOn: "member-a" }))
    .toMatchObject({ status: "paused" });
  await h.seedMeta("finished", { state: "Shipped", currentWorkflow: null, completed: "2026-10-01",
    prUrl: "https://example.test/pull/1", dependsOn: ["member-a"] }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const before = lifecycleSuccess(await h.store.version());
  const result = await runStoreDecomposeDiscard(h.ctx, "origin");
  expect(result).toMatchObject({ status: "refused", reason: "removed-stub-held", message: expect.stringContaining("outsider") });
  if (result.status !== "refused") throw new Error(JSON.stringify(result));
  expect(result.message).not.toContain("finished");
  if (kind !== "depends-on") for (const action of ["arc pause outsider", "--waits-on <other>", "--waits-on-note <text>", "--no-waits-on"])
    expect(result.remedy.text).toContain(action);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  if (kind === "depends-on") {
    const current = lifecycleSuccess(await readWorkUnit(h.store, "outsider"));
    await h.handEdit(current, writeMetaDependsOn(current.content, []));
  } else expect(await runPause(pause, { name: "outsider", identity: h.ctx.identity, waitsOn: false })).toMatchObject({ status: "paused" });
  await discard(h);
});

it.each(["unreadable", "incomplete"] as const)("requires a complete surviving-edge count for a %s inventory", async failure => {
  const h = await createDecomposeTerminalFixture();
  const list = h.store.list.bind(h.store);
  let broken = true;
  const remedy = { text: "Restore the missing lifecycle evidence." };
  h.store.list = async input => {
    if (input.kind !== "work-item/meta" || !broken) return list(input);
    return { status: "ok", result: failure === "unreadable"
      ? { status: "unreadable", condition: "Lifecycle inventory unavailable.", remedy }
      : { status: "complete", records: [], missed: true,
        diagnostics: [{ kind: "unreadable", key: "work-item/meta:missing", condition: "A metadata record is unavailable.", remedy }] } };
  };
  expect(await runStoreDecomposeDiscard(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "inventory-incomplete",
    class: "recoverable", remedy });
  broken = false;
  await discard(h);
});
