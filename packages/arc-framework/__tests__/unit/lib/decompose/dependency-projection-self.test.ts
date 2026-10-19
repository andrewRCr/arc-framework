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
