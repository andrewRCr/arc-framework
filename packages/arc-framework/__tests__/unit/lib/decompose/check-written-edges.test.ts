/** Provider checks reject ended or ambiguous targets before any cut writes. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { checkDecomposeWrittenEdges } from "../../../../src/lib/decompose/check-written-edges.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";

it.each(["abandoned", "decomposed", "ambiguous"] as const)("refuses a written provider that is %s and admits dropping its target disposition", async ended => {
  const h = await createDecomposePlanFixture();
  if (ended === "abandoned") await h.seedRetiredWorkUnit(h.provider);
  if (ended === "decomposed") {
    const successor = await h.seedStub("successor");
    const owner = successor.reference.owner;
    if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected successor generation.");
    await h.seedRetiredWorkUnit(h.provider, { kind: "decompose", successors: [{ name: owner.name, uid: owner.uid }] });
  }
  const lookup = h.store.lookup.bind(h.store);
  if (ended === "ambiguous") {
    const ambiguity: StoreRefusal = { code: "ambiguous-match", class: "recoverable", condition: "Two providers hold this slug.",
      candidates: [h.provider.reference, h.primary.reference], remedy: { text: "Resolve the provider's ambiguous name." } };
    h.store.lookup = async input => input.kind === "slug" && input.slug === "provider" ? { status: "refused", refusal: ambiguity } : lookup(input);
  }
  const first = await h.plan();
  const refused = await checkDecomposeWrittenEdges(h.ctx, h.map, first.facts, first.projection);
  expect(refused).toMatchObject({ status: "refused", reason: "provider", class: "recoverable" });
  expect(refused?.remedy.text).toContain(ended === "decomposed" ? "Depends On" : "drop");
  const outgoing = h.map.authoring.outgoingDispositions[0];
  if (outgoing === undefined) throw new Error("Expected outgoing edge.");
  outgoing.disposition = { kind: "drop", reason: "The cut writes no edge to this provider." };
  const repaired = await h.plan();
  expect(await checkDecomposeWrittenEdges(h.ctx, h.map, repaired.facts, repaired.projection)).toBeUndefined();
});

it("refuses a started home's new provider edge and admits leaving that edge to its owner", async () => {
  const h = await createDecomposePlanFixture();
  await h.seedMeta("home");
  h.map.authoring.shape = "heterogeneous";
  h.map.authoring.destinations.unshift({ kind: "existing-home", destinationId: "home", target: { kind: "work-unit", slug: "home" } });
  const outgoing = h.map.authoring.outgoingDispositions[0];
  if (outgoing === undefined) throw new Error("Expected outgoing edge.");
  outgoing.disposition = { kind: "targets", targets: ["home"] };
  const planned = await h.plan();
  const refused = await checkDecomposeWrittenEdges(h.ctx, h.map, planned.facts, planned.projection);
  expect(refused).toMatchObject({ status: "refused", reason: "started-edge", class: "recoverable",
    locus: "authoring.outgoingDispositions.0.disposition.targets.0" });
  expect(refused?.remedy.text).toContain("owner");
  outgoing.disposition = { kind: "drop", reason: "Leave the edge to the home's owner." };
  const repaired = await h.plan();
  expect(await checkDecomposeWrittenEdges(h.ctx, h.map, repaired.facts, repaired.projection)).toBeUndefined();
});

it.each(["drop", "add-member"] as const)("refuses extraction's %s disposition for a started dependent and admits retaining only the origin", async action => {
  const h = await createDecomposePlanFixture(true);
  await h.seedMeta("consumer", { dependsOn: ["origin"] });
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine, true);
  const incoming = map.authoring.incomingDispositions[0];
  if (incoming === undefined) throw new Error("Expected incoming edge.");
  incoming.disposition = action === "drop" ? { kind: "drop", reason: "Move this edge." }
    : { kind: "replace", replacementTargets: ["member-a", "origin"] };
  const planned = await h.plan(map);
  const refused = await checkDecomposeWrittenEdges(h.ctx, map, planned.facts, planned.projection);
  expect(refused).toMatchObject({ status: "refused", reason: "started-edge", class: "recoverable",
    locus: "authoring.incomingDispositions.0.disposition" });
  expect(refused?.remedy.text).toContain("origin");
  incoming.disposition = { kind: "replace", replacementTargets: ["origin"] };
  const repaired = await h.plan(map);
  expect(await checkDecomposeWrittenEdges(h.ctx, map, repaired.facts, repaired.projection)).toBeUndefined();
});

it.each(["shipped", "abandoned", "decomposed"] as const)("refuses reusing the origin's %s provider name until that original edge is settled", async ended => {
  const h = await createDecomposePlanFixture();
  if (ended === "shipped") lifecycleSuccess(await h.store.write({ ...recordPut(h.provider, {
    content: renderMetaFile("provider", { state: "Shipped", owner: h.ctx.identity, currentWorkflow: null,
      completed: "2026-10-19", prUrl: "https://example.test/pull/1" }), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  else if (ended === "abandoned") await h.seedRetiredWorkUnit(h.provider);
  else {
    const successor = await h.seedStub("successor");
    const owner = successor.reference.owner;
    if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected successor.");
    await h.seedRetiredWorkUnit(h.provider, { kind: "decompose", successors: [{ name: owner.name, uid: owner.uid }] });
  }
  const member = h.map.authoring.destinations[1];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "provider";
  h.map.authoring.internalEdges = [{ from: "member-a", to: "provider" }];
  for (const entry of h.map.authoring.outgoingDispositions) entry.disposition = { kind: "drop", reason: "No member inherits the old provider edge." };
  const planned = await h.plan();
  const refused = await checkDecomposeWrittenEdges(h.ctx, h.map, planned.facts, planned.projection);
  expect(refused).toMatchObject({ status: "refused", reason: "provider", class: "recoverable", locus: "machine.outgoingEdges.0.provider.slug" });
  expect(refused?.remedy.text).toContain("Depends On");
  expect(refused?.remedy.text).toContain("--preflight");
  expect(refused?.remedy.text).toContain("--revise");
  const primary = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
  await h.handEdit(primary, writeMetaDependsOn(primary.content, []));
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const repaired = completeCutMapFixture(fresh.result.machine);
  const replacement = repaired.authoring.destinations[1];
  if (replacement?.kind !== "new-member") throw new Error("Expected replacement.");
  replacement.slug = "provider";
  repaired.authoring.internalEdges = [{ from: "member-a", to: "provider" }];
  const after = await h.plan(repaired);
  expect(await checkDecomposeWrittenEdges(h.ctx, repaired, after.facts, after.projection)).toBeUndefined();
  expect(after.projection.members[0]?.dependsOn).toEqual(["provider"]);
});

it("directs a started origin to its own reconcile and admits a freshly bound map afterward", async () => {
  const h = await createDecomposePlanFixture(true);
  await h.seedRetiredWorkUnit(h.provider);
  const member = h.map.authoring.destinations[0];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "provider";
  for (const outgoing of h.map.authoring.outgoingDispositions) outgoing.disposition = { kind: "drop", reason: "No inherited edge." };
  const before = await h.plan();
  const refused = await checkDecomposeWrittenEdges(h.ctx, h.map, before.facts, before.projection);
  expect(refused).toMatchObject({ status: "refused", reason: "provider", class: "recoverable" });
  expect(refused?.remedy.text).toContain("arc wu reconcile --apply");
  expect(refused?.remedy.text).toContain("origin's checkout");
  const current = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(current, { content: writeMetaDependsOn(current.content, []) }),
    provenance: { verb: "wu-reconcile", lifecycleAction: "reconcile" } }));
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const repaired = completeCutMapFixture(fresh.result.machine, true);
  const planned = await h.plan(repaired);
  expect(await checkDecomposeWrittenEdges(h.ctx, repaired, planned.facts, planned.projection)).toBeUndefined();
});
