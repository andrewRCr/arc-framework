/** Final batch admission binds observed records and relevant inventory without a namespace freshness token. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { withCompetingBatch } from "../../../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { runStoreDecomposeDiscard } from "../../../../src/lib/decompose/discard.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { recordReferences, RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { writeMetaDependsOn, writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { resolveDecomposeConflict } from "../../../fixtures/decompose-conflict.js";

it.each(["dependency", "pause"] as const)("refuses disputed surviving %s edges at discard publication and completes after resolution", async edge => {
  const h = await createDecomposeTerminalFixture();
  const outsider = await h.seedStub("outside");
  const preview = await runStoreDecomposeDiscard(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  let competing: unknown;
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    const reference = RecordReferenceSchema.parse({ owner: outsider.reference.owner,
      kind: "work-item/conflict-record", key: "abcdef12" });
    const incoming = edge === "dependency" ? writeMetaDependsOn(outsider.content, ["member-b"])
      : writeMetaPause(outsider.content, { pausedBy: SlugSchema.parse(h.ctx.identity), since: "2026-10-19T00:00:00Z",
        reason: "Waiting.", waitsOn: { kind: "work-unit", slug: SlugSchema.parse("member-b") }, resumeNotes: null, open: false });
    const label = { actor: "competing-writer", time: "2026-10-19T00:00:00Z" };
    lifecycleSuccess(await h.store.write({ action: "put", reference, expected: null,
      content: JSON.stringify({ record: outsider.reference, location: { kind: "hunk", start: 0, end: 1 },
        base: outsider.content, current: { content: outsider.content, label }, incoming: { content: incoming, label } }),
      provenance: { verb: "sync", lifecycleAction: "merge" } }));
    competing = lifecycleSuccess(await h.store.version());
  });
  expect(await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "refused" });
  expect(lifecycleSuccess(await h.store.version())).toBe(competing);
  for (const reference of preview.result.removals) expect((await h.store.read({ reference })).status).toBe("ok");
  await resolveDecomposeConflict(h.store, outsider);
  const fresh = await runStoreDecomposeDiscard(h.ctx, "origin");
  if (fresh.status === "refused" || fresh.result.kind !== "preview") throw Error(JSON.stringify(fresh));
  expect(await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: fresh.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "discarded" } });
});

it.each(["execute", "extract"] as const)("refuses a new incoming owner at %s admission and admits a rebound map", async mode => {
  const h = await createDecomposePlanFixture(mode === "extract");
  let competing: unknown;
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    await h.seedMeta("late-dependent", { state: "Planning", currentWorkflow: null, dependsOn: ["origin"] },
      { kind: "backlog", commitment: "planned" });
    competing = lifecycleSuccess(await h.store.version());
  });
  const input = { cutMap: h.map, cutMapPath: "cut.json" };
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", mode, input)).toMatchObject({ status: "refused" });
  expect(lifecycleSuccess(await h.store.version())).toBe(competing);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw Error(JSON.stringify(fresh));
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", mode, {
    ...input, cutMap: completeCutMapFixture(fresh.result.machine, mode === "extract"),
  })).toMatchObject({ status: "ok" });
});

it("refuses a new empty origin companion at additive admission and permits reacquisition", async () => {
  const h = await createDecomposePlanFixture();
  let competing: unknown;
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    await h.seed(recordReferences["work-item/notes"](h.primary.reference.owner), "");
    competing = lifecycleSuccess(await h.store.version());
  });
  const input = { cutMap: h.map, cutMapPath: "cut.json" };
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", input)).toMatchObject({ status: "refused" });
  expect(lifecycleSuccess(await h.store.version())).toBe(competing);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  const emptyUnits = new Set(fresh.result.machine.sourceUnits
    .filter(unit => unit.sourceLocator.artifact === "notes-origin.md").map(unit => unit.sourceId));
  for (const allocation of map.authoring.sourceAllocations) if (emptyUnits.has(allocation.sourceId)) {
    allocation.disposition = { kind: "drop", reason: "The empty companion holds no retained work." };
  }
  const retry = await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { ...input, cutMap: map });
  expect(retry, JSON.stringify(retry)).toMatchObject({ status: "ok" });
});

it.each([false, true])("guards the %s extraction terminal inventory after its final reread", async extraction => {
  const h = await createDecomposeTerminalFixture({ extraction, started: extraction });
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  const outsider = await h.seedStub("late-dependent");
  let competing: unknown;
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    await h.handEdit(outsider, writeMetaDependsOn(outsider.content, ["origin"]));
    competing = lifecycleSuccess(await h.store.version());
  });
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "refused" });
  expect(lifecycleSuccess(await h.store.version())).toBe(competing);
  const fresh = lifecycleSuccess(await h.store.read({ reference: outsider.reference }));
  await h.handEdit(fresh, writeMetaDependsOn(fresh.content, []));
  const repaired = await runStoreDecomposeFinish(h.ctx, "origin");
  if (repaired.status === "refused" || repaired.result.kind !== "preview") throw Error(JSON.stringify(repaired));
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: repaired.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "applied" } });
});

it.each(["discard", "revise"] as const)("requires fresh %s approval when a removed group gains an empty record", async mode => {
  const h = await createDecomposeTerminalFixture();
  const map = structuredClone(h.map);
  const replacement = map.authoring.destinations.find(destination => destination.kind === "new-member" && destination.slug === "member-b");
  if (replacement?.kind !== "new-member") throw Error("Expected a replacement member.");
  replacement.slug = "member-c";
  map.authoring.internalEdges = [];
  for (const allocation of map.authoring.sourceAllocations) if (allocation.disposition.kind === "target"
    && allocation.disposition.destinationId === replacement.destinationId) allocation.disposition.targetLocator.artifact = "draft-member-c.md";
  const run = (applyAuthority?: string) => mode === "discard" ? runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority })
    : runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority });
  const preview = await run();
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  let competing: unknown;
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    await h.seed(recordReferences["work-item/notes"](member.reference.owner), "");
    competing = lifecycleSuccess(await h.store.version());
  });
  expect(await run(preview.result.applyAuthority)).toMatchObject({ status: "refused" });
  expect(lifecycleSuccess(await h.store.version())).toBe(competing);
  const repaired = await run();
  if (repaired.status === "refused" || repaired.result.kind !== "preview") throw Error(JSON.stringify(repaired));
  expect(await run(repaired.result.applyAuthority)).toMatchObject({ status: "ok" });
});

it.each([false, true])("refuses a read-only destination edit during %s extraction apply and completes from repaired evidence", async extraction => {
  const h = await createDecomposeTerminalFixture({ extraction, started: extraction });
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const draft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](primary.reference.owner) }));
  let competing: unknown;
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    await h.handEdit(draft, draft.content.replace("## Scope", "## Changed"));
    competing = lifecycleSuccess(await h.store.version());
  });
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "refused" });
  expect(lifecycleSuccess(await h.store.version())).toBe(competing);
  const changed = lifecycleSuccess(await h.store.read({ reference: draft.reference }));
  await h.handEdit(changed, draft.content);
  const fresh = await runStoreDecomposeFinish(h.ctx, "origin");
  if (fresh.status === "refused" || fresh.result.kind !== "preview") throw Error(JSON.stringify(fresh));
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: fresh.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "applied" } });
});

it("admits an unrelated new work item during apply without a namespace-wide freshness condition", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  h.ctx.executor.store = withCompetingBatch(h.store, async () => { await h.seedStub("independent-work"); });
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "applied" } });
  expect(await readWorkUnit(h.store, "independent-work")).toMatchObject({ status: "ok" });
});


it("refuses an inbound list created at additive admission and completes after its entries are routed away", async () => {
  const h = await createDecomposePlanFixture();
  let competing: unknown;
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    await h.seed(recordReferences["work-item/inbound"](h.primary.reference.owner),
      "# Inbound\n\n## Inbound\n\n### Held concern\n\n_Id:_ `1234abcd`\n\nKeep this concern.\n");
    competing = lifecycleSuccess(await h.store.version());
  });
  const input = { cutMap: h.map, cutMapPath: "cut.json" };
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", input)).toMatchObject({ status: "refused" });
  expect(lifecycleSuccess(await h.store.version())).toBe(competing);
  const inbound = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/inbound"](h.primary.reference.owner) }));
  const recipient = await h.seedStub("inbound-recipient");
  lifecycleSuccess(await h.store.batch({ provenance: { verb: "route", lifecycleAction: "route" }, writes: [
    { action: "put", reference: inbound.reference, expected: inbound.version, content: "# Inbound\n\n## Inbound\n" },
    { action: "put", reference: recordReferences["work-item/inbound"](recipient.reference.owner), expected: null, content: inbound.content },
  ] }));
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", input)).toMatchObject({ status: "ok" });
});
