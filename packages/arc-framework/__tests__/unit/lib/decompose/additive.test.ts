/** The additive cut writes members and prior-generation edge settlement in one checked batch. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { readWorkUnit, readLifecycleMetaFields } from "../../../../src/lib/store/lifecycle-write.js";
import { writeCutMapRecord } from "../../../../src/lib/store/kinds/cut-map/index.js";

it("settles a prior abandoned provider's stub edge beside every scaffold and the stored map", async () => {
  const h = await createDecomposePlanFixture();
  const prior = await h.seedStub("reused");
  const consumer = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["provider", "reused"] },
    { kind: "backlog", commitment: "planned" });
  await h.seedRetiredWorkUnit(prior);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  const member = map.authoring.destinations[1];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "reused";
  map.authoring.internalEdges = [{ from: "member-a", to: "reused" }];
  for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["reused"] };
  const result = await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" });
  expect(result).toMatchObject({ status: "ok", result: { members: [{ slug: "member-a" }, { slug: "reused" }], cohorts: [{ path: "group" }] } });
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  const settled = lifecycleSuccess(await h.store.read({ reference: consumer.reference }));
  expect(lifecycleSuccess(readLifecycleMetaFields(settled)).dependsOn).toEqual(["provider"]);
  expect(lifecycleSuccess(await h.store.read({ reference: result.result.storedMap })).content).toEqual(writeCutMapRecord(map));
  const replacement = lifecycleSuccess(await readWorkUnit(h.store, "reused"));
  expect(replacement.reference.owner).not.toEqual(prior.reference.owner);
  for (const write of result.result.batch.writes) expect(lifecycleSuccess(await h.store.history({ reference: write.reference }))[0]?.provenance)
    .toMatchObject({ verb: "decompose", lifecycleAction: "additive", batchId: result.result.batch.batchId });
});
