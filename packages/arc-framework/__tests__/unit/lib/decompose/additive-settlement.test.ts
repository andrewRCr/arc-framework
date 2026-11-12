/** Prior-generation provider settlement is applied through the production registry. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { readLifecycleMetaFields, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import type { WorkItemRef } from "../../../../src/lib/store/kinds/lineage/index.js";

function reference(record: StoreRecord): WorkItemRef {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected a generation.");
  return { name: owner.name, uid: owner.uid };
}

it.each(["shipped", "decomposed", "chain", "chain-shipped"] as const)("settles a %s provider chain in the additive batch", async ended => {
  const h = await createDecomposePlanFixture();
  const prior = await h.seedStub("reused");
  const consumer = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["provider", "reused"] },
    { kind: "backlog", commitment: "planned" });
  if (ended === "shipped") lifecycleSuccess(await h.store.write({ ...recordPut(prior, { content: renderMetaFile("reused", {
    state: "Shipped", owner: h.ctx.identity, currentWorkflow: null, completed: "2026-10-19", prUrl: "https://example.test/pull/1",
  }), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }), provenance: { verb: "archive", lifecycleAction: "archive" } }));
  else {
    const leaf = ended === "chain-shipped" ? await h.seedCompletedWorkUnit("replacement") : await h.seedStub("replacement");
    const middle = ended === "decomposed" ? leaf : await h.seedStub("middle");
    const retire = (subject: StoreRecord, target: StoreRecord) => h.seedRetiredWorkUnit(subject, {
      kind: "decompose", successors: [reference(target)], incoming: [{ dependent: reference(consumer),
        disposition: { kind: "replace", replacementTargets: [reference(target)] } }],
    });
    await retire(prior, middle);
    if (ended !== "decomposed") await retire(middle, leaf);
  }
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  const member = map.authoring.destinations[1];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "reused";
  map.authoring.internalEdges = [{ from: "member-a", to: "reused" }];
  for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["reused"] };
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" })).toMatchObject({ status: "ok" });
  const settled = lifecycleSuccess(await h.store.read({ reference: consumer.reference }));
  expect(lifecycleSuccess(readLifecycleMetaFields(settled)).dependsOn).toEqual(ended === "shipped" || ended === "chain-shipped"
    ? ["provider"] : ["provider", "replacement"]);
});

it("combines two reused provider slots into one dependent rewrite", async () => {
  const h = await createDecomposePlanFixture();
  const first = await h.seedStub("member-a"), second = await h.seedStub("reused"), replacement = await h.seedStub("replacement");
  const consumer = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["member-a", "provider", "reused"] },
    { kind: "backlog", commitment: "planned" });
  await h.seedRetiredWorkUnit(first);
  await h.seedRetiredWorkUnit(second, { kind: "decompose", successors: [reference(replacement)], incoming: [{ dependent: reference(consumer),
    disposition: { kind: "replace", replacementTargets: [reference(replacement)] } }] });
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  const member = map.authoring.destinations[1];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "reused";
  map.authoring.internalEdges = [{ from: "member-a", to: "reused" }];
  for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["reused"] };
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" })).toMatchObject({ status: "ok" });
  const settled = lifecycleSuccess(await h.store.read({ reference: consumer.reference }));
  expect(lifecycleSuccess(readLifecycleMetaFields(settled)).dependsOn).toEqual(["provider", "replacement"]);
});
