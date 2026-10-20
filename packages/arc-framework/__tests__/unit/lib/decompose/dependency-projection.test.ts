/** Dependency projection seeds members and rewrites stub recipients over checked stored records. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { acquireDecomposeDependencyFacts } from "../../../../src/lib/decompose/dependency-facts.js";
import { projectDecomposeDependencies } from "../../../../src/lib/decompose/dependency-projection.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";
import { checkDecomposeHomes } from "../../../../src/lib/decompose/check-homes.js";
import { acquireDecomposeOrigin } from "../../../../src/lib/decompose/acquire-origin.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";

async function fixture(started = false) {
  const h = await createDecomposeOriginFixture(started);
  await h.seedStub("provider");
  await h.seedStub("unrelated");
  await h.handEdit(h.primary, writeMetaDependsOn(h.primary.content, ["provider"]));
  const dependent = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["unrelated", "origin"] },
    { kind: "backlog", commitment: "planned" });
  const prepared = await prepareDecomposePreflight(h.ctx, "origin");
  if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
  const map = completeCutMapFixture(prepared.result.machine, started);
  const acquired = await acquireDecomposeDependencyFacts(h.ctx, map, prepared.result.acquired, []);
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  return { ...h, dependent, map, facts: acquired.result, prepared: prepared.result };
}

it("seeds each member and replaces the origin slot on a stub dependent while preserving unrelated edge order", async () => {
  const h = await fixture();
  const result = projectDecomposeDependencies(h.map, h.facts);
  expect(result).toMatchObject({ status: "ok", result: {
    members: [{ destinationId: "member-a", slug: "member-a", dependsOn: ["member-b"] },
      { destinationId: "member-b", slug: "member-b", dependsOn: ["provider"] }],
    edits: [{ primary: h.dependent, beforeTargets: ["unrelated", "origin"], afterTargets: ["unrelated", "member-a"] }],
  } });
});

it.each([
  { reason: "self-dependency", locus: "authoring.internalEdges.0", mutate: (map: CutMap) => { map.authoring.internalEdges = [{ from: "member-a", to: "member-a" }]; } },
  { reason: "redundant-external-edge", locus: "authoring.externalEdges.0.to", mutate: (map: CutMap) => { map.authoring.externalEdges = [{ from: "member-a", to: "member-b" }]; } },
  { reason: "retiring-origin-target", locus: "authoring.externalEdges.0.to", mutate: (map: CutMap) => { map.authoring.externalEdges = [{ from: "member-a", to: "origin" }]; } },
  { reason: "unknown-external-target", locus: "authoring.externalEdges.0.to", mutate: (map: CutMap) => { map.authoring.externalEdges = [{ from: "member-a", to: "absent" }]; } },
  { reason: "unchanged-dependency-slot", locus: "", mutate: (map: CutMap) => { map.authoring.externalEdges = [{ from: "member-b", to: "provider" }]; } },
  { reason: "origin-reference-remains", locus: "authoring.incomingDispositions.0.disposition.replacementTargets.0", mutate: (map: CutMap) => {
    const entry = map.authoring.incomingDispositions[0];
    if (entry === undefined) throw new Error("Expected incoming edge.");
    entry.disposition = { kind: "replace", replacementTargets: ["origin"] };
  } },
])("refuses $reason before writing and projects after correcting the map", async ({ reason, locus, mutate }) => {
  const h = await fixture();
  const original = structuredClone(h.map);
  mutate(h.map);
  const facts = await acquireDecomposeDependencyFacts(h.ctx, h.map, h.prepared.acquired, []);
  if (facts.status === "refused") throw new Error(JSON.stringify(facts));
  const refused = projectDecomposeDependencies(h.map, facts.result);
  expect(refused).toMatchObject({ status: "refused", reason, class: "recoverable", ...(locus === "" ? {} : { locus }) });
  if (refused.status !== "refused") throw new Error("Expected dependency rule refusal.");
  expect(refused.locus).toMatch(/^authoring\./u);
  if (locus === "") expect(["authoring.externalEdges.0", "authoring.outgoingDispositions.0.disposition.targets.0"]).toContain(refused.locus);
  expect(projectDecomposeDependencies(original, h.facts)).toMatchObject({ status: "ok" });
});

it("refuses a contribution adding a provider the existing home already names, then admits its explicit drop", async () => {
  const h = await fixture();
  await h.seedMeta("home", { state: "Planning", currentWorkflow: null, dependsOn: ["provider"] }, { kind: "backlog", commitment: "planned" });
  h.map.authoring.shape = "heterogeneous";
  h.map.authoring.destinations.unshift({ kind: "existing-home", destinationId: "home", target: { kind: "work-unit", slug: "home" } });
  const outgoing = h.map.authoring.outgoingDispositions[0];
  if (outgoing === undefined) throw new Error("Expected outgoing edge.");
  outgoing.disposition = { kind: "targets", targets: ["home"] };
  const homes = await checkDecomposeHomes(h.ctx, h.map);
  if (homes.status === "refused") throw new Error(JSON.stringify(homes));
  const facts = await acquireDecomposeDependencyFacts(h.ctx, h.map, h.prepared.acquired, homes.result);
  if (facts.status === "refused") throw new Error(JSON.stringify(facts));
  expect(projectDecomposeDependencies(h.map, facts.result)).toMatchObject({ status: "refused", reason: "unchanged-dependency-slot",
    locus: "authoring.outgoingDispositions.0.disposition.targets.0" });
  outgoing.disposition = { kind: "drop", reason: "The home already depends on this provider." };
  expect(projectDecomposeDependencies(h.map, facts.result)).toMatchObject({ status: "ok" });
});

it("projects a new provider onto a stub home without losing its existing edge", async () => {
  const h = await fixture();
  const home = await h.seedMeta("home", { state: "Planning", currentWorkflow: null, dependsOn: ["unrelated"] }, { kind: "backlog", commitment: "planned" });
  h.map.authoring.shape = "heterogeneous";
  h.map.authoring.destinations.unshift({ kind: "existing-home", destinationId: "home", target: { kind: "work-unit", slug: "home" } });
  const outgoing = h.map.authoring.outgoingDispositions[0];
  if (outgoing === undefined) throw new Error("Expected outgoing edge.");
  outgoing.disposition = { kind: "targets", targets: ["home"] };
  const homes = await checkDecomposeHomes(h.ctx, h.map);
  if (homes.status === "refused") throw new Error(JSON.stringify(homes));
  const facts = await acquireDecomposeDependencyFacts(h.ctx, h.map, h.prepared.acquired, homes.result);
  if (facts.status === "refused") throw new Error(JSON.stringify(facts));
  const projected = projectDecomposeDependencies(h.map, facts.result);
  expect(projected.status).toBe("ok");
  if (projected.status === "refused") throw new Error(JSON.stringify(projected));
  expect(projected.result.edits).toContainEqual({ primary: home, beforeTargets: ["unrelated"], afterTargets: ["unrelated", "provider"],
    locus: "authoring.outgoingDispositions.0.disposition.targets.0" });
});

it("limits terminal projection to stub dependents and homes, leaving member seeds and started recipients unwritten", async () => {
  const h = await fixture();
  await h.seedMeta("started-consumer", { dependsOn: ["origin"] });
  await h.seedMeta("home", { dependsOn: ["unrelated"] });
  const prepared = await prepareDecomposePreflight(h.ctx, "origin");
  if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
  const map = completeCutMapFixture(prepared.result.machine);
  map.authoring.shape = "heterogeneous";
  map.authoring.destinations.unshift({ kind: "existing-home", destinationId: "home", target: { kind: "work-unit", slug: "home" } });
  const outgoing = map.authoring.outgoingDispositions[0];
  if (outgoing === undefined) throw new Error("Expected outgoing edge.");
  outgoing.disposition = { kind: "targets", targets: ["home"] };
  const homes = await checkDecomposeHomes(h.ctx, map);
  if (homes.status === "refused") throw new Error(JSON.stringify(homes));
  const facts = await acquireDecomposeDependencyFacts(h.ctx, map, prepared.result.acquired, homes.result);
  if (facts.status === "refused") throw new Error(JSON.stringify(facts));
  const terminal = projectDecomposeDependencies(map, facts.result, "terminal");
  expect(terminal.status).toBe("ok");
  if (terminal.status === "refused") throw new Error(JSON.stringify(terminal));
  expect(terminal.result.members).toEqual([]);
  expect(terminal.result.edits.map(edit => edit.primary.reference.owner.name)).toEqual(["consumer"]);
});

it("replaces a former origin spelling by generation without losing unrelated edges", async () => {
  const h = await fixture();
  const renamed = await runStoreRename({ store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main" },
    { sourceSlug: "origin", targetSlug: "current-source" });
  if (renamed.status !== "renamed") throw new Error(JSON.stringify(renamed));
  const consumer = lifecycleSuccess(await h.store.read({ reference: h.dependent.reference }));
  await h.handEdit(consumer, writeMetaDependsOn(consumer.content, ["unrelated", "origin"]));
  const prepared = await prepareDecomposePreflight(h.ctx, "current-source");
  if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
  const map = completeCutMapFixture(prepared.result.machine);
  const facts = await acquireDecomposeDependencyFacts(h.ctx, map, prepared.result.acquired, []);
  if (facts.status === "refused") throw new Error(JSON.stringify(facts));
  expect(projectDecomposeDependencies(map, facts.result)).toMatchObject({ status: "ok", result: { edits: [
    { beforeTargets: ["unrelated", "origin"], afterTargets: ["unrelated", "member-a"] },
  ] } });
});

it("keeps a renamed dependent bound to its UID when projecting the stored map", async () => {
  const h = await fixture();
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main" },
    { sourceSlug: "consumer", targetSlug: "renamed-consumer" })).toMatchObject({ status: "renamed" });
  const acquired = await acquireDecomposeOrigin(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const facts = await acquireDecomposeDependencyFacts(h.ctx, h.map, acquired.result, []);
  if (facts.status === "refused") throw new Error(JSON.stringify(facts));
  const projected = projectDecomposeDependencies(h.map, facts.result, "terminal");
  expect(projected.status).toBe("ok");
  if (projected.status === "refused") throw new Error(JSON.stringify(projected));
  expect(projected.result.edits).toHaveLength(1);
  expect(projected.result.edits[0]).toMatchObject({ primary: { reference: { owner: { name: "renamed-consumer" } } },
    afterTargets: ["unrelated", "member-a"] });
});

it("permits an extraction's member edge to the origin and preserves an unchanged incoming origin slot", async () => {
  const h = await fixture(true);
  h.map.authoring.externalEdges = [{ from: "member-a", to: "origin" }];
  const facts = await acquireDecomposeDependencyFacts(h.ctx, h.map, h.prepared.acquired, []);
  if (facts.status === "refused") throw new Error(JSON.stringify(facts));
  const projected = projectDecomposeDependencies(h.map, facts.result);
  expect(projected.status).toBe("ok");
  if (projected.status === "refused") throw new Error(JSON.stringify(projected));
  expect(projected.result.edits).toEqual([]);
  expect(projected.result.members).toHaveLength(1);
  expect(projected.result.members[0]?.dependsOn).toEqual(expect.arrayContaining(["origin", "provider"]));
  expect(projected.result.members[0]?.dependsOn).toHaveLength(2);
});

it("leaves a dependent completed after inventory unwritten when its primary is acquired", async () => {
  const h = await fixture();
  lifecycleSuccess(await h.store.write({ ...recordPut(h.dependent, {
    content: renderMetaFile("consumer", { state: "Shipped", owner: h.ctx.identity, currentWorkflow: null,
      dependsOn: ["unrelated", "origin"], completed: "2026-10-19", prUrl: "https://example.test/pull/1" }),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const facts = await acquireDecomposeDependencyFacts(h.ctx, h.map, h.prepared.acquired, []);
  if (facts.status === "refused") throw new Error(JSON.stringify(facts));
  const projected = projectDecomposeDependencies(h.map, facts.result, "terminal");
  expect(projected).toMatchObject({ status: "ok", result: { members: [], edits: [] } });
});
