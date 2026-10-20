/** Incoming replacements cannot turn a recipient's origin edge into a self dependency. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn, writeMetaCurrentWorkflow } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { checkDecomposeHomes } from "../../../../src/lib/decompose/check-homes.js";
import { acquireDecomposeDependencyFacts } from "../../../../src/lib/decompose/dependency-facts.js";
import { projectDecomposeDependencies } from "../../../../src/lib/decompose/dependency-projection.js";
import type { DecomposeResult } from "../../../../src/lib/decompose/refusal.js";

function decomposeSuccess<T>(result: DecomposeResult<T>): T {
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  return result.result;
}

it.each(([false, true] as const).flatMap(alias => (["additive", "revision"] as const).map(mode => ({ alias, mode }))))(
  "refuses outgoing self transfers and completes after retargeting in $mode, alias=$alias", async ({ alias, mode }) => {
    const h = await createDecomposeOriginFixture(true);
    await h.handEdit(h.draft, "# Origin\n\n## Member\n\nMember work.\n\n## Home\n\nHome work.\n");
    await h.seedStub("provider");
    if (alias) expect(await runStoreRename({ ...h.ctx.executor, baseBranch: h.ctx.baseBranch },
      { sourceSlug: "provider", targetSlug: "current-provider" })).toMatchObject({ status: "renamed" });
    const provider = lifecycleSuccess(await readWorkUnit(h.store, "provider"));
    const artifact = `draft-${provider.reference.owner.name}.md`;
    await h.seed(recordReferences["work-item/draft"](provider.reference.owner), "# Provider\n\n## Home\n\nAuthored home work.\n");
    await h.handEdit(h.primary, writeMetaDependsOn(h.primary.content, ["provider"]));
    const fresh = decomposeSuccess(await prepareDecomposePreflight(h.ctx, "origin"));
    const map = completeCutMapFixture(fresh.machine, true);
    map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-provider", target: { kind: "work-unit", slug: "provider" } });
    for (const allocation of map.authoring.sourceAllocations) {
      const locator = map.machine.sourceUnits.find(unit => unit.sourceId === allocation.sourceId)?.sourceLocator;
      if (locator?.kind === "section" && locator.headingSource === "Home") allocation.disposition = {
        kind: "target", destinationId: "z-provider", targetLocator: { ...locator, artifact },
      };
    }
    for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["provider"] };
    if (mode === "revision") {
      const initial = structuredClone(map);
      for (const outgoing of initial.authoring.outgoingDispositions) outgoing.disposition = { kind: "drop", reason: "Leave this edge out." };
      decomposeSuccess(await runStoreDecomposeAdditive(h.ctx, "origin", "extract", { cutMap: initial, cutMapPath: "cut.json" }));
    }
    const before = lifecycleSuccess(await h.store.version());
    const input = { cutMap: map, cutMapPath: "cut.json" };
    const refused = mode === "additive" ? await runStoreDecomposeAdditive(h.ctx, "origin", "extract", input)
      : await runStoreDecomposeRevision(h.ctx, "origin", input);
    expect(refused).toMatchObject({ status: "refused", reason: "self-dependency",
      locus: "authoring.outgoingDispositions.0.disposition.targets.0" });
    expect(lifecycleSuccess(await h.store.version())).toBe(before);
    const homes = decomposeSuccess(await checkDecomposeHomes(h.ctx, map));
    const facts = decomposeSuccess(await acquireDecomposeDependencyFacts(h.ctx, map, fresh.acquired, homes));
    expect(projectDecomposeDependencies(map, facts, "terminal")).toMatchObject({ status: "refused", reason: "self-dependency" });
    for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["member-a"] };
    if (mode === "additive") decomposeSuccess(await runStoreDecomposeAdditive(h.ctx, "origin", "extract", input));
    else {
      const preview = decomposeSuccess(await runStoreDecomposeRevision(h.ctx, "origin", input));
      if (preview.kind !== "preview") throw new Error("Expected revision preview.");
      decomposeSuccess(await runStoreDecomposeRevision(h.ctx, "origin", input, { applyAuthority: preview.applyAuthority }));
    }
    expect(lifecycleSuccess(await readWorkUnit(h.store, "provider")).fields).toMatchObject({ dependsOn: [] });
  });

it.each([[false, false], [true, false], [false, true]] as const)("refuses an incoming self replacement before additive writes and admits its repair, alias=%s started=%s", async (alias, started) => {
  const h = await createDecomposeOriginFixture();
  const home = await h.seedStub("home");
  await h.handEdit(home, writeMetaDependsOn(home.content, ["origin"]));
  if (alias) expect(await runStoreRename({ ...h.ctx.executor, baseBranch: h.ctx.baseBranch },
    { sourceSlug: "home", targetSlug: "existing-work" })).toMatchObject({ status: "renamed" });
  const current = lifecycleSuccess(await readWorkUnit(h.store, "home"));
  await h.seed(recordReferences["work-item/draft"](current.reference.owner), "# Existing work\n\n## Scope\n\nOwned work.\n");
  if (started) lifecycleSuccess(await h.store.write({ ...recordPut(current, { placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(current.content, "draft-design") }), provenance: { verb: "start", lifecycleAction: "start" } }));
  const preflight = await prepareDecomposePreflight(h.ctx, "origin");
  if (preflight.status === "refused") throw new Error(JSON.stringify(preflight));
  const map = completeCutMapFixture(preflight.result.machine);
  map.authoring.shape = "heterogeneous";
  map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-home", target: { kind: "work-unit", slug: "home" } });
  for (const allocation of map.authoring.sourceAllocations) {
    if (allocation.disposition.kind === "target" && allocation.disposition.targetLocator.kind === "section") {
      allocation.disposition.destinationId = "z-home";
      allocation.disposition.targetLocator.artifact = `draft-${current.reference.owner.name}.md`;
    }
  }
  for (const incoming of map.authoring.incomingDispositions) incoming.disposition = { kind: "replace", replacementTargets: ["home"] };
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" }))
    .toMatchObject({ status: "refused", reason: "self-dependency", locus: "authoring.incomingDispositions.0.disposition" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  for (const incoming of map.authoring.incomingDispositions) incoming.disposition = { kind: "replace", replacementTargets: ["member-a"] };
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" }))
    .toMatchObject({ status: "ok" });
});
