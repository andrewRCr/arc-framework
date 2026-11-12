/** Terminal dependencies repeat current recipient ownership and written-provider admission. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaCurrentWorkflow, writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { prepareDecomposeTerminalEdges } from "../../../../src/lib/decompose/terminal-edges.js";
import type { DecomposeContext } from "../../../../src/lib/decompose/context.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";

async function check(ctx: DecomposeContext, revise?: (map: CutMap) => void) {
  const acquired = await acquireDecomposeTerminal(ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  revise?.(acquired.result.map);
  return prepareDecomposeTerminalEdges(ctx, acquired.result);
}

it("refuses a new edge for a home started after scaffolding and continues after its owner supplies the edge", async () => {
  const h = await createDecomposeTerminalFixture({ withHome: true, provider: true, authorMap: map => {
    for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["home"] };
  } });
  const home = lifecycleSuccess(await readWorkUnit(h.store, "home"));
  lifecycleSuccess(await h.store.write({ ...recordPut(home, { placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(home.content, "draft-design") }), provenance: { verb: "start", lifecycleAction: "start" } }));
  const before = lifecycleSuccess(await h.store.version());
  const refusal = await check(h.ctx);
  expect(refusal).toMatchObject({ status: "refused", reason: "started-edge",
    locus: "authoring.outgoingDispositions.0.disposition.targets.0",
    remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  if (refusal.status !== "refused") throw new Error("Expected started-home refusal.");
  expect(refusal.remedy.text).toContain("owner");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const started = lifecycleSuccess(await readWorkUnit(h.store, "home"));
  await h.handEdit(started, writeMetaDependsOn(started.content, ["origin", "provider"]));
  const repaired = await check(h.ctx);
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(repaired.result.projection.edits.map(edit => edit.primary.reference.owner.name)).not.toContain("home");
});

it("refuses an abandoned provider on an actual terminal home edit and admits a dropped disposition", async () => {
  const h = await createDecomposeTerminalFixture({ withHome: true, provider: true, authorMap: map => {
    for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["home"] };
  } });
  const provider = lifecycleSuccess(await readWorkUnit(h.store, "provider"));
  await h.seedRetiredWorkUnit(provider);
  const before = lifecycleSuccess(await h.store.version());
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "provider",
    locus: "authoring.outgoingDispositions.0.disposition.targets.0",
    message: expect.stringContaining("provider"), remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  // Exercise the preparation component with the repaired decision; revision persists it separately.
  const repaired = await check(h.ctx, map => {
    for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "drop", reason: "Provider ended." };
  });
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(repaired.result.projection.edits.every(edit => !edit.afterTargets.includes("provider"))).toBe(true);
});

it("admits a retired provider on a member seed that the terminal batch does not write", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true, authorMap: map => {
    for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "drop", reason: "No inherited outgoing edge." };
    map.authoring.externalEdges = [{ from: "member-b", to: "provider" }];
  } });
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "provider")));
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  await h.handEdit(member, writeMetaDependsOn(member.content, []));
  const result = await check(h.ctx);
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.projection.members).toEqual([]);
  expect(result.result.projection.edits.map(edit => edit.primary.reference.owner.name)).toEqual(["consumer"]);
});

it("protects a dependent started after an extraction's additive batch and admits retaining the origin", async () => {
  const h = await createDecomposeTerminalFixture({ started: true, extraction: true, authorMap: map => {
    for (const incoming of map.authoring.incomingDispositions) incoming.disposition = { kind: "replace", replacementTargets: ["member-a"] };
  } });
  const consumer = lifecycleSuccess(await readWorkUnit(h.store, "consumer"));
  lifecycleSuccess(await h.store.write({ ...recordPut(consumer, { placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(consumer.content, "draft-design") }), provenance: { verb: "start", lifecycleAction: "start" } }));
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "started-edge",
    locus: "authoring.incomingDispositions.0.disposition", remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  expect(await check(h.ctx, map => {
    for (const incoming of map.authoring.incomingDispositions) incoming.disposition = { kind: "replace", replacementTargets: ["origin"] };
  })).toMatchObject({ status: "ok" });
});

it("refuses an abandoned external provider written onto a home and admits dropping that edge", async () => {
  const h = await createDecomposeTerminalFixture({ withHome: true, provider: true, authorMap: map => {
    for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "drop", reason: "No inherited outgoing edge." };
    map.authoring.externalEdges = [{ from: "home", to: "provider" }];
  } });
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "provider")));
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "provider", locus: "authoring.externalEdges.0",
    remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  expect(await check(h.ctx, map => { map.authoring.externalEdges = []; })).toMatchObject({ status: "ok" });
});

it("preserves an operational provider failure and continues when that observation recovers", async () => {
  const h = await createDecomposeTerminalFixture({ withHome: true, provider: true, authorMap: map => {
    for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["home"] };
  } });
  const acquired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const lookup = h.store.lookup.bind(h.store);
  const refusal: StoreRefusal = { code: "namespace-corrupt", namespace: "work", class: "terminal",
    condition: "The provider namespace is corrupt.", remedy: { text: "Repair the provider namespace." } };
  h.store.lookup = async input => input.kind === "slug" && input.slug === "provider" ? { status: "refused", refusal } : lookup(input);
  expect(await prepareDecomposeTerminalEdges(h.ctx, acquired.result)).toMatchObject({ status: "refused", reason: "store",
    class: "terminal", remedy: refusal.remedy, storeRefusal: refusal });
  h.store.lookup = lookup;
  expect(await prepareDecomposeTerminalEdges(h.ctx, acquired.result)).toMatchObject({ status: "ok" });
});

it("keeps member slugs separate from home destination IDs in started-home admission", async () => {
  const h = await createDecomposeTerminalFixture({ withHome: true, authorMap: map => {
    const member = map.authoring.destinations.find(destination => destination.kind === "new-member" && destination.slug === "member-a");
    if (member?.kind !== "new-member") throw new Error("Expected member.");
    member.slug = "z-home";
    for (const allocation of map.authoring.sourceAllocations) {
      if (allocation.disposition.kind === "target" && allocation.disposition.destinationId === member.destinationId) {
        allocation.disposition.targetLocator.artifact = "draft-z-home.md";
      }
    }
    map.authoring.internalEdges = [{ from: "z-home", to: "member-b" }];
    for (const incoming of map.authoring.incomingDispositions) incoming.disposition = { kind: "replace", replacementTargets: ["z-home"] };
  } });
  const home = lifecycleSuccess(await readWorkUnit(h.store, "home"));
  lifecycleSuccess(await h.store.write({ ...recordPut(home, { placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(home.content, "draft-design") }), provenance: { verb: "start", lifecycleAction: "start" } }));
  expect((await check(h.ctx)).status).toBe("ok");
});
